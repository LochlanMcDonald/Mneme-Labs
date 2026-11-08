// CrowdStrike Falcon connector. Falcon's API is OAuth2 client-credentials:
// every call needs a bearer token minted from the client id and secret
// first. Tokens last ~30 minutes, so this module caches one per client id
// and only re-authenticates when it is about to expire. Needs an API
// client with the "Alerts: read" scope.
//
// WHAT IT COUNTS, AND WHY IT IS NOT A SIMPLE pagination.total.
// The tile answers "how many detections are waiting for someone", so it
// counts NEW, UNASSIGNED, ENDPOINT detections — and it counts them the way
// the Falcon console's Endpoint detections page does: one row per detection
// card, not per alert record. Falcon groups many alert records under a
// single card (keyed by aggregate_id — agent + process tree), so counting
// raw records, or reading meta.pagination.total, overcounts badly: one card
// can hold a dozen records. So the connector queries matching alert ids,
// hydrates them, drops the assigned ones, then collapses to distinct
// aggregate_id. That number reconciles against the console.
//
// Optional creds (no form field needed; sensible defaults):
//   product        Falcon product filter. Default "epp" (endpoint); set to
//                  "" to count every module (idp, cloud, etc.).
//   lookbackHours  Only count detections created in the last N hours. Unset
//                  or 0 means no time bound — every untriaged detection,
//                  however old, still counts (that is usually what "waiting"
//                  should mean on a panel).

const TOKEN_SLACK_MS = 60_000;
const MAX_IDS = 5000; // hard cap so a flooded tenant cannot hang the poll
const PAGE = 1000; // Falcon's max page size for the queries endpoint
const HYDRATE_BATCH = 100; // max composite_ids per entities request

// Falcon severity_name -> the tile's four buckets. Informational folds into
// low, matching how the other connectors treat their lowest tier.
const SEV_RANK = { informational: 0, low: 1, medium: 2, high: 3, critical: 4 };
const RANK_BUCKET = ['low', 'low', 'medium', 'high', 'critical'];

// Full credential set -> { token, expiresAt } so rapid refreshes reuse one
// token instead of re-authenticating each time. Keyed on all three inputs:
// keying on the client id alone would keep serving a cached token after
// the secret or cloud changed.
const tokenCache = new Map();

async function bearerToken(baseUrl, clientId, clientSecret) {
  const cacheKey = `${baseUrl}|${clientId}|${clientSecret}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt - TOKEN_SLACK_MS > Date.now()) {
    return cached.token;
  }
  const res = await fetch(`${baseUrl}/oauth2/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret }),
  });
  if (!res.ok) {
    throw new Error(
      res.status === 401 || res.status === 403
        ? 'CrowdStrike rejected the API client id or secret'
        : `CrowdStrike token endpoint returned ${res.status}`,
    );
  }
  const data = await res.json();
  const token = data.access_token;
  if (!token) throw new Error('CrowdStrike returned no access token');
  tokenCache.set(cacheKey, {
    token,
    expiresAt: Date.now() + (Number(data.expires_in) || 1799) * 1000,
  });
  return token;
}

async function authed(baseUrl, token, path, options = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
      ...(options.headers || {}),
    },
  });
  if (res.status === 403) throw new Error('The API client is missing the "Alerts: read" scope');
  if (!res.ok) throw new Error(`CrowdStrike alerts API returned ${res.status}`);
  return res.json();
}

function buildFilter(creds) {
  const parts = [`status:'new'`];

  // Unset product means endpoint only; an explicit "" means all modules.
  const product = creds.product === undefined ? 'epp' : String(creds.product).trim();
  if (product) parts.push(`product:'${product}'`);

  const hours = Number(creds.lookbackHours);
  if (Number.isFinite(hours) && hours > 0) {
    const since = new Date(Date.now() - hours * 3600_000).toISOString();
    parts.push(`created_timestamp:>'${since}'`);
  }
  return parts.join('+');
}

const isUnassigned = (a) => !a.assigned_to_uid && !a.assigned_to_name && !a.assigned_to_uuid;

/** All composite_ids matching the filter, paged to the cap. */
async function queryIds(baseUrl, token, filter) {
  const ids = [];
  let offset = 0;
  while (ids.length < MAX_IDS) {
    const page = await authed(
      baseUrl,
      token,
      `/alerts/queries/alerts/v2?limit=${PAGE}&offset=${offset}&filter=${encodeURIComponent(filter)}`,
    );
    const batch = page?.resources || [];
    ids.push(...batch);
    if (batch.length < PAGE) break;
    offset += batch.length;
  }
  return ids;
}

/** Hydrate ids into alert records so assignment and aggregate_id are visible. */
async function hydrate(baseUrl, token, ids) {
  const alerts = [];
  for (let i = 0; i < ids.length; i += HYDRATE_BATCH) {
    const data = await authed(baseUrl, token, `/alerts/entities/alerts/v2`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ composite_ids: ids.slice(i, i + HYDRATE_BATCH) }),
    });
    alerts.push(...(data?.resources || []));
  }
  return alerts;
}

export async function poll(creds) {
  const clientId = String(creds.clientId || '').trim();
  const clientSecret = String(creds.clientSecret || '').trim();
  // Falcon clouds have distinct API hosts (US-1, US-2, EU-1, gov); default
  // to US-1 when no region is given.
  const baseUrl = String(creds.baseUrl || 'https://api.crowdstrike.com')
    .trim()
    .replace(/\/+$/, '');
  if (!clientId || !clientSecret) {
    throw new Error('CrowdStrike needs an API client id and secret');
  }

  const token = await bearerToken(baseUrl, clientId, clientSecret);

  const ids = await queryIds(baseUrl, token, buildFilter(creds));
  const empty = { total: 0, severities: { critical: 0, high: 0, medium: 0, low: 0 } };
  if (ids.length === 0) return empty;

  const unassigned = (await hydrate(baseUrl, token, ids)).filter(isUnassigned);

  // Collapse to detection cards, keeping each card at its highest severity —
  // which is how the console badges a multi-record card.
  const cardRank = new Map();
  for (const a of unassigned) {
    const cardId = a.aggregate_id || a.composite_id || a.id;
    if (!cardId) continue;
    const rank = SEV_RANK[String(a.severity_name || '').toLowerCase()] ?? 1;
    cardRank.set(cardId, Math.max(cardRank.get(cardId) ?? -1, rank));
  }

  const severities = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const rank of cardRank.values()) severities[RANK_BUCKET[rank]] += 1;

  return { total: cardRank.size, severities };
}

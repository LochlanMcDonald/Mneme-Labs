// CrowdStrike Falcon connector. Falcon's API is OAuth2 client-credentials:
// every call needs a bearer token minted from the client id and secret
// first. Tokens last ~30 minutes, so this module caches one per client id
// and only re-authenticates when it is about to expire. Needs an API
// client with the "Alerts: read" scope.

const TOKEN_SLACK_MS = 60_000;

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

/** Count of new alerts matching an FQL filter, via the pagination total. */
async function countAlerts(baseUrl, token, filter) {
  const url = `${baseUrl}/alerts/queries/alerts/v2?limit=1&filter=${encodeURIComponent(filter)}`;
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
  });
  if (res.status === 403) throw new Error('The API client is missing the "Alerts: read" scope');
  if (!res.ok) throw new Error(`CrowdStrike alerts query returned ${res.status}`);
  const data = await res.json();
  return Number(data?.meta?.pagination?.total) || 0;
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

  const NEW = `status:'new'`;
  const [critical, high, medium, low] = await Promise.all([
    countAlerts(baseUrl, token, `${NEW}+severity_name:'Critical'`),
    countAlerts(baseUrl, token, `${NEW}+severity_name:'High'`),
    countAlerts(baseUrl, token, `${NEW}+severity_name:'Medium'`),
    countAlerts(baseUrl, token, `${NEW}+severity_name:'Low'`),
  ]);

  return {
    total: critical + high + medium + low,
    severities: { critical, high, medium, low },
  };
}

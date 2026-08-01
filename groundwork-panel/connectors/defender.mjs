// Microsoft Defender connector, via the Graph security API. Auth is
// OAuth2 client-credentials against Entra: a bearer token is minted from
// the tenant id, app (client) id and client secret, then alerts_v2 is
// queried per severity using $count so no alert bodies are fetched. The
// app registration needs the SecurityAlert.Read.All application
// permission with admin consent.

const TOKEN_SLACK_MS = 60_000;

// Full credential set -> { token, expiresAt }; Entra tokens last ~1 hour.
const tokenCache = new Map();

async function bearerToken(loginUrl, graphUrl, tenantId, clientId, clientSecret) {
  const cacheKey = `${loginUrl}|${tenantId}|${clientId}|${clientSecret}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt - TOKEN_SLACK_MS > Date.now()) {
    return cached.token;
  }
  const res = await fetch(`${loginUrl}/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: `${graphUrl}/.default`,
    }),
  });
  if (!res.ok) {
    throw new Error(
      res.status === 400 || res.status === 401
        ? 'Microsoft rejected the tenant id, app id or client secret'
        : `Microsoft token endpoint returned ${res.status}`,
    );
  }
  const data = await res.json();
  if (!data.access_token) throw new Error('Microsoft returned no access token');
  tokenCache.set(cacheKey, {
    token: data.access_token,
    expiresAt: Date.now() + (Number(data.expires_in) || 3599) * 1000,
  });
  return data.access_token;
}

/** Count of new alerts at one severity, via $count instead of paging. */
async function countAlerts(graphUrl, token, severity) {
  const filter = encodeURIComponent(`status eq 'new' and severity eq '${severity}'`);
  const res = await fetch(
    `${graphUrl}/v1.0/security/alerts_v2?$count=true&$top=1&$filter=${filter}`,
    {
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json',
        // Graph requires this header before it will honor $count.
        consistencylevel: 'eventual',
      },
    },
  );
  if (res.status === 403) {
    throw new Error('The app is missing the SecurityAlert.Read.All permission (grant admin consent)');
  }
  if (!res.ok) throw new Error(`Graph alerts query returned ${res.status}`);
  const data = await res.json();
  return Number(data['@odata.count']) || 0;
}

export async function poll(creds) {
  const tenantId = String(creds.tenantId || '').trim();
  const clientId = String(creds.clientId || '').trim();
  const clientSecret = String(creds.clientSecret || '').trim();
  // Overridable for tests and sovereign clouds.
  const loginUrl = String(creds.loginUrl || 'https://login.microsoftonline.com').replace(/\/+$/, '');
  const graphUrl = String(creds.graphUrl || 'https://graph.microsoft.com').replace(/\/+$/, '');
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('Defender needs a tenant id, app id and client secret');
  }

  const token = await bearerToken(loginUrl, graphUrl, tenantId, clientId, clientSecret);

  // Graph severities top out at "high"; informational folds into low.
  const [high, medium, low, informational] = await Promise.all([
    countAlerts(graphUrl, token, 'high'),
    countAlerts(graphUrl, token, 'medium'),
    countAlerts(graphUrl, token, 'low'),
    countAlerts(graphUrl, token, 'informational'),
  ]);

  return {
    total: high + medium + low + informational,
    severities: { critical: 0, high, medium, low: low + informational },
  };
}

// Microsoft Sentinel connector. Sentinel incidents live behind Azure
// Resource Manager, so auth is Entra client-credentials scoped to ARM
// (not Graph), and the incident list is read from the SecurityInsights
// provider on the Log Analytics workspace, following nextLink pages. The
// app registration needs the "Microsoft Sentinel Reader" role on the
// workspace (or resource group).

const TOKEN_SLACK_MS = 60_000;
const API_VERSION = '2024-03-01';
const PAGE_CAP = 10; // 50 per page; a tile does not need more than 500.

const tokenCache = new Map();

async function bearerToken(loginUrl, armUrl, tenantId, clientId, clientSecret) {
  const cacheKey = `${loginUrl}|${armUrl}|${tenantId}|${clientId}|${clientSecret}`;
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
      scope: `${armUrl}/.default`,
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

export async function poll(creds) {
  const tenantId = String(creds.tenantId || '').trim();
  const clientId = String(creds.clientId || '').trim();
  const clientSecret = String(creds.clientSecret || '').trim();
  const subscriptionId = String(creds.subscriptionId || '').trim();
  const resourceGroup = String(creds.resourceGroup || '').trim();
  const workspace = String(creds.workspace || '').trim();
  // Overridable for tests and sovereign clouds.
  const loginUrl = String(creds.loginUrl || 'https://login.microsoftonline.com').replace(/\/+$/, '');
  const armUrl = String(creds.armUrl || 'https://management.azure.com').replace(/\/+$/, '');
  if (!tenantId || !clientId || !clientSecret || !subscriptionId || !resourceGroup || !workspace) {
    throw new Error('Sentinel needs tenant, app credentials, subscription, resource group and workspace');
  }

  const token = await bearerToken(loginUrl, armUrl, tenantId, clientId, clientSecret);

  const filter = encodeURIComponent(`properties/status ne 'Closed'`);
  let url =
    `${armUrl}/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}` +
    `/providers/Microsoft.OperationalInsights/workspaces/${workspace}` +
    `/providers/Microsoft.SecurityInsights/incidents` +
    `?api-version=${API_VERSION}&$filter=${filter}&$top=50`;

  const severities = { critical: 0, high: 0, medium: 0, low: 0 };
  let total = 0;
  for (let page = 0; url && page < PAGE_CAP; page += 1) {
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    });
    if (res.status === 403) {
      throw new Error('The app needs the Microsoft Sentinel Reader role on the workspace');
    }
    if (!res.ok) throw new Error(`Sentinel incidents query returned ${res.status}`);
    const data = await res.json();
    for (const inc of data.value ?? []) {
      total += 1;
      const s = String(inc?.properties?.severity || '').toLowerCase();
      // Sentinel severities: High, Medium, Low, Informational.
      if (s === 'high') severities.high += 1;
      else if (s === 'medium') severities.medium += 1;
      else severities.low += 1;
    }
    url = data.nextLink || null;
  }

  return { total, severities };
}

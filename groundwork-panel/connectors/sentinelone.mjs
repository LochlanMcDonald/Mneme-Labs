// SentinelOne connector. Auth is a static API token sent as
// "Authorization: ApiToken <token>" against the tenant's own console URL.
// Counts unresolved threats by confidence level through the pagination
// totals: malicious surfaces as high, suspicious as medium.

async function countThreats(baseUrl, apiToken, confidenceLevel) {
  const url =
    `${baseUrl}/web/api/v2.1/threats?limit=1&resolved=false` +
    `&confidenceLevel=${encodeURIComponent(confidenceLevel)}`;
  const res = await fetch(url, {
    headers: { authorization: `ApiToken ${apiToken}`, accept: 'application/json' },
  });
  if (res.status === 401) throw new Error('SentinelOne rejected the API token');
  if (!res.ok) throw new Error(`SentinelOne threats query returned ${res.status}`);
  const data = await res.json();
  return Number(data?.pagination?.totalItems) || 0;
}

export async function poll(creds) {
  const baseUrl = String(creds.baseUrl || '').trim().replace(/\/+$/, '');
  const apiToken = String(creds.apiToken || '').trim();
  if (!baseUrl || !apiToken) {
    throw new Error('SentinelOne needs the console URL and an API token');
  }

  const [malicious, suspicious] = await Promise.all([
    countThreats(baseUrl, apiToken, 'malicious'),
    countThreats(baseUrl, apiToken, 'suspicious'),
  ]);

  return {
    total: malicious + suspicious,
    severities: { critical: 0, high: malicious, medium: suspicious, low: 0 },
  };
}

// GitHub connector: counts open security alerts for an org or user.
// Needs a token with security_events (classic) or the equivalent
// fine-grained read permissions on Dependabot, code scanning and secret
// scanning alerts.

const API = 'https://api.github.com';

async function count(path, token) {
  // per_page=1 plus the Link header's last page number gives the total
  // without paging through every alert.
  const res = await fetch(`${API}${path}?state=open&per_page=1`, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'groundwork-panel',
    },
  });
  if (res.status === 404) return null; // feature off or no access; not fatal
  if (!res.ok) throw new Error(`GitHub ${res.status} on ${path}`);
  const link = res.headers.get('link') || '';
  const last = link.match(/[?&]page=(\d+)>;\s*rel="last"/);
  if (last) return Number(last[1]);
  const body = await res.json();
  return Array.isArray(body) ? body.length : 0;
}

export async function poll(creds) {
  const owner = String(creds.org || '').trim();
  const token = String(creds.token || '').trim();
  if (!owner || !token) throw new Error('GitHub needs an organization and a token');

  // Try org endpoints first; fall back per-feature for user accounts.
  const bases = [`/orgs/${owner}`, `/users/${owner}`];
  let secrets = null;
  let code = null;
  let deps = null;
  for (const base of bases) {
    if (secrets === null) secrets = await count(`${base}/secret-scanning/alerts`, token).catch(() => null);
    if (code === null) code = await count(`${base}/code-scanning/alerts`, token).catch(() => null);
    if (deps === null) deps = await count(`${base}/dependabot/alerts`, token).catch(() => null);
  }
  if (secrets === null && code === null && deps === null) {
    throw new Error('GitHub token could not read any alert endpoints');
  }

  // Leaked secrets are treated as critical, code scanning as high,
  // Dependabot as low; a per-severity breakdown of Dependabot would need
  // paging through alerts, which the tile does not need.
  return {
    total: (secrets ?? 0) + (code ?? 0) + (deps ?? 0),
    severities: {
      critical: secrets ?? 0,
      high: code ?? 0,
      medium: 0,
      low: deps ?? 0,
    },
  };
}

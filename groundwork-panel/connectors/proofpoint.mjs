// Proofpoint TRAP (Threat Response Auto-Pull) connector. TRAP is usually
// an appliance on your own network, so the panel talks to its host
// directly with a static API key in the Authorization header and lists
// open incidents. TRAP does not report a uniform severity, so every open
// incident surfaces as high: an open TRAP incident is a threat mid
// quarantine that a human should look at.
//
// The appliance must present a certificate this machine trusts; add its
// CA with NODE_EXTRA_CA_CERTS if it uses an internal one.

export async function poll(creds) {
  const baseUrl = String(creds.baseUrl || '').trim().replace(/\/+$/, '');
  const apiKey = String(creds.apiKey || '').trim();
  if (!baseUrl || !apiKey) {
    throw new Error('Proofpoint TRAP needs the appliance URL and an API key');
  }

  const res = await fetch(`${baseUrl}/api/incidents?state=open`, {
    headers: { authorization: apiKey, accept: 'application/json' },
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error('TRAP rejected the API key');
  }
  if (!res.ok) throw new Error(`TRAP incidents API returned ${res.status}`);
  const data = await res.json();
  const incidents = Array.isArray(data) ? data : (data.incidents ?? []);

  const total = incidents.length;
  return {
    total,
    severities: { critical: 0, high: total, medium: 0, low: 0 },
  };
}

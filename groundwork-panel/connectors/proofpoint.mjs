// Proofpoint TAP connector. Auth is HTTP Basic with the TAP service
// principal and secret against the SIEM API. One call to /v2/siem/all
// returns the last hour of events; threats that got through (delivered
// messages, permitted clicks) surface as high, blocked ones as low.

export async function poll(creds) {
  const principal = String(creds.principal || '').trim();
  const secret = String(creds.secret || '').trim();
  // Overridable for tests.
  const baseUrl = String(creds.baseUrl || 'https://tap-api-v2.proofpoint.com').replace(/\/+$/, '');
  if (!principal || !secret) {
    throw new Error('Proofpoint TAP needs a service principal and secret');
  }

  // The SIEM API caps sinceSeconds at one hour.
  const res = await fetch(`${baseUrl}/v2/siem/all?format=json&sinceSeconds=3600`, {
    headers: {
      authorization: `Basic ${Buffer.from(`${principal}:${secret}`).toString('base64')}`,
      accept: 'application/json',
    },
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error('Proofpoint rejected the service principal or secret');
  }
  if (!res.ok) throw new Error(`Proofpoint SIEM API returned ${res.status}`);
  const data = await res.json();

  const len = (a) => (Array.isArray(a) ? a.length : 0);
  const through = len(data.messagesDelivered) + len(data.clicksPermitted);
  const blocked = len(data.messagesBlocked) + len(data.clicksBlocked);

  return {
    total: through + blocked,
    severities: { critical: 0, high: through, medium: 0, low: blocked },
  };
}

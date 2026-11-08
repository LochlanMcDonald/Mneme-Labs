// Proofpoint TRAP (Threat Response Auto-Pull) connector. TRAP is usually
// an appliance on your own network, so the panel talks to its host
// directly with a static API key in the Authorization header and lists
// open incidents nobody has picked up yet. TRAP does not report a uniform
// severity, so every such incident surfaces as high: an open TRAP incident
// is a threat mid quarantine that a human should look at.
//
// Three things the appliance's API insists on, learned the hard way:
//   - Auth is a BARE token in the Authorization header ("Authorization:
//     <key>"), not "Bearer <key>". This connector already sends it bare.
//   - A `created_after` parameter is MANDATORY — a call without one is
//     rejected (400) — and the window cannot exceed 30 days. So the poll
//     always sends a bounded window (default 24h, override lookbackHours).
//   - `assignee` comes back as the literal string "Unassigned" rather than
//     null when nobody owns it, so a plain falsy check misses it.
//
// The appliance must present a certificate this machine trusts; add its
// CA with NODE_EXTRA_CA_CERTS if it uses an internal one.

const DEFAULT_LOOKBACK_HOURS = 24;
const MAX_LOOKBACK_HOURS = 24 * 30; // TRAP clamps anything longer

// Values TRAP uses for "nobody owns this", beyond null/undefined.
const UNASSIGNED = new Set(['', 'unassigned', 'none', 'null', 'n/a']);
function isUnassigned(incident) {
  const a = incident.assignee;
  if (a === null || a === undefined) return true;
  if (typeof a === 'string') return UNASSIGNED.has(a.trim().toLowerCase());
  if (typeof a === 'object') return !(a.name || a.username || a.email || a.id);
  return false;
}

function lookbackHours(creds) {
  const raw = Number(creds.lookbackHours);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_LOOKBACK_HOURS;
  return Math.min(raw, MAX_LOOKBACK_HOURS);
}

export async function poll(creds) {
  const baseUrl = String(creds.baseUrl || '').trim().replace(/\/+$/, '');
  const apiKey = String(creds.apiKey || '').trim();
  if (!baseUrl || !apiKey) {
    throw new Error('Proofpoint TRAP needs the appliance URL and an API key');
  }

  const params = new URLSearchParams({
    state: 'open',
    created_after: new Date(Date.now() - lookbackHours(creds) * 3600_000).toISOString(),
    expand_events: 'false', // metadata only — the event payload is huge otherwise
  });

  const res = await fetch(`${baseUrl}/api/incidents?${params.toString()}`, {
    headers: { authorization: apiKey, accept: 'application/json' },
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error('TRAP rejected the API key');
  }
  if (res.status === 400) {
    throw new Error('TRAP rejected the query (it requires a created_after window of 30 days or less)');
  }
  if (!res.ok) throw new Error(`TRAP incidents API returned ${res.status}`);
  const data = await res.json();
  const incidents = Array.isArray(data) ? data : (data.incidents ?? data.results ?? []);

  // Open and unowned = waiting for a human.
  const total = incidents.filter(isUnassigned).length;
  return {
    total,
    severities: { critical: 0, high: total, medium: 0, low: 0 },
  };
}

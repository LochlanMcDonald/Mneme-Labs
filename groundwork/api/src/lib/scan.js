// Public-exposure analysis. Everything here works from DNS records only,
// which the caller reads from a public resolver. Nothing in this module
// touches the target's own servers, so the check is passive: it sees only
// what the target has already published to the world.
//
// A guiding rule: never turn "we could not read this" into a finding about
// the domain. A failed or incomplete lookup is reported as unknown, not as
// exposure, so the tool cannot cry wolf on a healthy domain.

// DoH (dns.google) response Status codes we care about.
const NOERROR = 0; // the name exists; records may still be empty
const NXDOMAIN = 3; // the name does not exist

/**
 * Normalize and validate a domain the visitor typed. Accepts things like
 * "https://www.Example.com/path" and returns "example.com", or null when
 * the input is not a plausible public domain. Rejects IPs, localhost and
 * bare TLDs so the scanner can only ever be pointed at real hostnames.
 */
function normalizeDomain(input) {
  let d = String(input || '').trim().toLowerCase();
  if (!d) return null;
  d = d.replace(/^[a-z]+:\/\//, ''); // strip scheme
  d = d.replace(/[/?#].*$/, ''); // strip path/query/fragment
  if (d.includes('@')) d = d.split('@').pop(); // an email address
  d = d.replace(/^www\./, ''); // treat www as the apex
  d = d.replace(/\.$/, ''); // strip trailing dot
  d = d.split(':')[0]; // strip any port
  if (!d || d.length > 253) return null;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(d)) return null; // no raw IPv4
  if (d === 'localhost' || d.endsWith('.local') || d.endsWith('.internal')) return null;
  if (!/^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(d)) {
    return null;
  }
  if (!/\.[a-z]{2,}$/.test(d)) return null;
  return d;
}

/** Strip the JSON quoting DoH puts around TXT records, joining any chunks. */
function cleanTxt(records) {
  return (records || [])
    .map((t) => String(t || '').replace(/^"|"$/g, '').replace(/" "/g, '').trim())
    .filter(Boolean);
}

function findSpf(txtRecords) {
  return (txtRecords || []).find((t) => /^v=spf1\b/i.test(t)) || null;
}

function findDmarc(txtRecords) {
  return (txtRecords || []).find((t) => /^v=DMARC1\b/i.test(t)) || null;
}

function dmarcPolicy(dmarc) {
  const m = /\bp=(none|quarantine|reject)\b/i.exec(dmarc || '');
  return m ? m[1].toLowerCase() : null;
}

/**
 * A single DoH query result is one of:
 *   null                      transport failure (network, timeout, non-2xx)
 *   { status, records: [] }   a DNS answer with a Status code
 * Turn a TXT query into a record state the analyzer understands:
 *   { known: false }                      we could not determine it
 *   { known: true, record: string|null }  we read it; record present or absent
 */
function txtState(query, finder) {
  if (query === null) return { known: false, record: null };
  if (query.status === NXDOMAIN) return { known: true, record: null }; // name absent = record absent
  if (query.status !== NOERROR) return { known: false, record: null }; // SERVFAIL etc: unknown
  return { known: true, record: finder(cleanTxt(query.records)) };
}

/** Same idea for MX: known/unknown plus whether any mail server exists. */
function mxState(query) {
  if (query === null) return { known: false, hasMx: false };
  if (query.status === NXDOMAIN) return { known: true, hasMx: false };
  if (query.status !== NOERROR) return { known: false, hasMx: false };
  return { known: true, hasMx: (query.records || []).length > 0 };
}

/** True when the resolver could not be reached for any of the lookups. */
function allFailed(...queries) {
  return queries.every((q) => q === null);
}

/**
 * True when the apex name does not exist. We only conclude "not found" when
 * a lookup positively returned NXDOMAIN and none returned NOERROR; a mix of
 * transient failures never gets mistaken for a missing domain.
 */
function domainNotFound(txtQuery, mxQuery) {
  const resolved =
    (txtQuery && txtQuery.status === NOERROR) || (mxQuery && mxQuery.status === NOERROR);
  const nx =
    (txtQuery && txtQuery.status === NXDOMAIN) || (mxQuery && mxQuery.status === NXDOMAIN);
  return Boolean(nx && !resolved);
}

const SEV_RANK = { critical: 3, high: 2, medium: 1, good: 0 };

/**
 * Turn read record states into a plain-language exposure report.
 * inputs: { spf, dmarc, mx } as produced by txtState / mxState.
 * Returns { domain, findings, worst, headline }.
 */
function analyze(domain, inputs) {
  const { spf, dmarc, mx } = inputs;
  const findings = [];

  // ── SPF ──
  if (!spf.known) {
    findings.push({
      id: 'spf',
      severity: 'unknown',
      title: 'SPF could not be read',
      detail:
        `The DNS lookup for ${domain} did not complete, so this is not a verdict about your ` +
        'domain. Try again in a moment.',
      fix: '',
    });
  } else if (!spf.record) {
    findings.push({
      id: 'spf',
      severity: 'critical',
      title: 'No SPF record',
      detail:
        `Nothing published on ${domain} says which servers are allowed to send email as your ` +
        'domain. A stranger can send mail that looks exactly like it came from you, and the ' +
        'receiver has no way to tell.',
      fix: 'Add a DNS TXT record on your domain: v=spf1 include:_your-provider -all',
    });
  } else {
    findings.push({
      id: 'spf',
      severity: 'good',
      title: 'SPF is published',
      detail: 'Your domain names the servers allowed to send email as you.',
      fix: '',
    });
  }

  // ── DMARC ──
  if (!dmarc.known) {
    findings.push({
      id: 'dmarc',
      severity: 'unknown',
      title: 'DMARC could not be read',
      detail: 'The DNS lookup did not complete, so this is not a verdict about your domain. Try again in a moment.',
      fix: '',
    });
  } else if (!dmarc.record) {
    findings.push({
      id: 'dmarc',
      severity: 'high',
      title: 'No DMARC policy',
      detail:
        'Without DMARC, mail servers are never told to reject forged messages from your domain, ' +
        'so spoofed email still lands in your customers’ inboxes.',
      fix: 'Add a TXT record at _dmarc.' + domain + ': v=DMARC1; p=reject; rua=mailto:you@' + domain,
    });
  } else {
    const policy = dmarcPolicy(dmarc.record);
    if (policy === 'none' || policy === null) {
      findings.push({
        id: 'dmarc',
        severity: 'medium',
        title: 'DMARC is set to monitor only',
        detail:
          'You have a DMARC record, but its policy does not ask receivers to do anything with ' +
          'forged mail. It reports the problem without stopping it.',
        fix: 'Move the policy from p=none to p=quarantine, then to p=reject once your reports look clean.',
      });
    } else {
      findings.push({
        id: 'dmarc',
        severity: 'good',
        title: `DMARC is enforcing (p=${policy})`,
        detail: 'Forged mail claiming to be your domain is told to be rejected or quarantined.',
        fix: '',
      });
    }
  }

  // ── MX (framing only, shown when we could read it) ──
  if (mx.known) {
    findings.push({
      id: 'mx',
      severity: 'good',
      title: mx.hasMx ? 'This domain receives email' : 'No mail servers found',
      detail: mx.hasMx
        ? 'Which is exactly why the records above matter: a live mailing domain is a spoofing target.'
        : 'The domain does not appear to receive email, which lowers (but does not remove) spoofing impact.',
      fix: '',
    });
  }

  // worst is computed over KNOWN severities only; unknowns never drive a
  // verdict. If nothing is genuinely wrong but a check did not complete, the
  // overall state is unknown, not good.
  let worst = 'good';
  for (const f of findings) {
    if (SEV_RANK[f.severity] !== undefined && SEV_RANK[f.severity] > SEV_RANK[worst]) {
      worst = f.severity;
    }
  }
  const hasUnknown = findings.some((f) => f.severity === 'unknown');
  if (worst === 'good' && hasUnknown) worst = 'unknown';

  let headline;
  if (!spf.known) {
    headline = 'We could not finish the check. Try again in a moment.';
  } else if (!spf.record) {
    headline = 'Right now, anyone can send email as you.';
  } else if (!dmarc.known) {
    headline = 'Your SPF is published. We could not read DMARC just now.';
  } else if (!dmarc.record) {
    headline = 'Your domain can still be spoofed.';
  } else {
    const policy = dmarcPolicy(dmarc.record);
    headline =
      policy === 'none' || policy === null
        ? 'You are close, but not enforcing it yet.'
        : 'Your email domain is locked down. Nice.';
  }

  return { domain, findings, worst, headline };
}

module.exports = {
  NOERROR,
  NXDOMAIN,
  normalizeDomain,
  cleanTxt,
  findSpf,
  findDmarc,
  dmarcPolicy,
  txtState,
  mxState,
  allFailed,
  domainNotFound,
  analyze,
};

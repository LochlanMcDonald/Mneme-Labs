// Public-exposure analysis. Everything here works from DNS records only,
// which the caller reads from a public resolver. Nothing in this module
// touches the target's own servers, so the check is passive: it sees only
// what the target has already published to the world.

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
  d = d.replace(/^www\./, ''); // treat www as the apex
  d = d.replace(/\.$/, ''); // strip trailing dot
  if (d.includes('@')) d = d.split('@').pop(); // an email address
  d = d.split(':')[0]; // strip any port
  if (!d || d.length > 253) return null;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(d)) return null; // no raw IPv4
  if (d === 'localhost' || d.endsWith('.local') || d.endsWith('.internal')) return null;
  // Labels: letters/digits/hyphens, no leading/trailing hyphen, at least
  // one dot, and a TLD of two or more letters.
  if (!/^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(d)) {
    return null;
  }
  if (!/\.[a-z]{2,}$/.test(d)) return null;
  return d;
}

function findSpf(txtRecords) {
  return (txtRecords || []).map((t) => t.trim()).find((t) => /^v=spf1\b/i.test(t)) || null;
}

function findDmarc(txtRecords) {
  return (txtRecords || []).map((t) => t.trim()).find((t) => /^v=DMARC1\b/i.test(t)) || null;
}

function dmarcPolicy(dmarc) {
  const m = /\bp=(none|quarantine|reject)\b/i.exec(dmarc || '');
  return m ? m[1].toLowerCase() : null;
}

const SEV_RANK = { critical: 3, high: 2, medium: 1, good: 0 };

/**
 * Turn raw DNS records into a plain-language exposure report.
 * records: { domainTxt: string[], dmarcTxt: string[], mx: string[] }
 * Returns { findings, worst, headline }.
 */
function analyze(domain, records) {
  const spf = findSpf(records.domainTxt);
  const dmarc = findDmarc(records.dmarcTxt);
  const policy = dmarcPolicy(dmarc);
  const hasMx = Array.isArray(records.mx) && records.mx.length > 0;

  const findings = [];

  if (!spf) {
    findings.push({
      id: 'spf',
      severity: 'critical',
      title: 'No SPF record',
      detail:
        `Nothing published on ${domain} says which servers are allowed to send email as your domain. ` +
        'A stranger can send mail that looks exactly like it came from you, and the receiver has no way to tell.',
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

  if (!dmarc) {
    findings.push({
      id: 'dmarc',
      severity: 'high',
      title: 'No DMARC policy',
      detail:
        'Without DMARC, mail servers are never told to reject forged messages from your domain, ' +
        'so spoofed email still lands in your customers’ inboxes.',
      fix: 'Add a TXT record at _dmarc.' + domain + ': v=DMARC1; p=reject; rua=mailto:you@' + domain,
    });
  } else if (policy === 'none' || policy === null) {
    findings.push({
      id: 'dmarc',
      severity: 'medium',
      title: 'DMARC is set to monitor only',
      detail:
        'You have a DMARC record, but its policy does not ask receivers to do anything with forged mail. ' +
        'It reports the problem without stopping it.',
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

  findings.push({
    id: 'mx',
    severity: 'good',
    title: hasMx ? 'This domain receives email' : 'No mail servers found',
    detail: hasMx
      ? 'Which is exactly why the records above matter: a live mailing domain is a spoofing target.'
      : 'The domain does not appear to receive email, which lowers (but does not remove) spoofing impact.',
    fix: '',
  });

  const worst = findings.reduce(
    (w, f) => (SEV_RANK[f.severity] > SEV_RANK[w] ? f.severity : w),
    'good',
  );

  let headline;
  if (worst === 'critical') headline = 'Right now, anyone can send email as you.';
  else if (worst === 'high') headline = 'Your domain can still be spoofed.';
  else if (worst === 'medium') headline = 'You are close, but not enforcing it yet.';
  else headline = 'Your email domain is locked down. Nice.';

  return { domain, findings, worst, headline };
}

module.exports = { normalizeDomain, analyze, findSpf, findDmarc, dmarcPolicy };

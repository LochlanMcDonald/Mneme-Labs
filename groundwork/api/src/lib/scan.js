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

const SEV_RANK = { critical: 4, high: 3, medium: 2, low: 1, good: 0 };

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

// ── DKIM (common-selector detection) ──
// Passive discovery can only probe well-known selectors; a custom selector
// cannot be seen from outside, so "not found" is reported honestly as "not
// found on common selectors", never as a flat "no DKIM".
const COMMON_DKIM_SELECTORS = [
  'selector1', 'selector2', // Microsoft 365
  'google', // Google Workspace
  'default', 'dkim', 'mail', 'smtp', // generic
  'k1', 'k2', 'k3', // Mailchimp and common ESPs
  's1', 's2',
];

/** selectorResults: [{ selector, query }] where query is a DoH result or null. */
function dkimState(selectorResults) {
  let anyKnown = false;
  for (const { selector, query } of selectorResults || []) {
    if (query === null) continue;
    anyKnown = true;
    if (query.status === NOERROR) {
      const rec = cleanTxt(query.records).find((t) => /^v=DKIM1\b/i.test(t) || /\bp=[A-Za-z0-9+/=]+/.test(t));
      if (rec) return { known: true, found: true, selector };
    }
  }
  return { known: anyKnown, found: false, selector: null };
}

function dkimFinding(state, domain) {
  if (!state.known) {
    return { id: 'dkim', section: 'email', severity: 'unknown', title: 'DKIM could not be read', detail: 'The DNS lookups for common DKIM selectors did not complete. Try again in a moment.', fix: '' };
  }
  if (state.found) {
    return { id: 'dkim', section: 'email', severity: 'good', title: `DKIM is published (${state.selector})`, detail: 'Your mail is cryptographically signed, which lets DMARC pass even when a message is forwarded.', fix: '' };
  }
  return { id: 'dkim', section: 'email', severity: 'medium', title: 'No DKIM found on common selectors', detail: `We checked the selectors used by Microsoft 365, Google Workspace and common providers and found none on ${domain}. DKIM may still exist under a custom selector we cannot see from outside, but if it is genuinely missing, your DMARC leans on SPF alone and fails on forwarded mail.`, fix: 'Enable DKIM in your mail provider and publish the selector records it gives you.' };
}

// ── DNSSEC ──
function dnssecFinding(dsQuery) {
  if (dsQuery === null) return { id: 'dnssec', section: 'dns', severity: 'unknown', title: 'DNSSEC could not be read', detail: 'The DNS lookup did not complete. Try again in a moment.', fix: '' };
  if (dsQuery.status === NOERROR && (dsQuery.records || []).length > 0) {
    return { id: 'dnssec', section: 'dns', severity: 'good', title: 'DNSSEC is enabled', detail: 'Your DNS records are cryptographically signed, so a tamperer cannot quietly forge them in transit.', fix: '' };
  }
  return { id: 'dnssec', section: 'dns', severity: 'low', title: 'DNSSEC is not enabled', detail: 'Without DNSSEC there is no cryptographic guarantee that the DNS answers for your domain have not been tampered with on the way to a resolver. Plenty of domains still run without it, but it closes a real class of attack.', fix: 'Ask your DNS host to enable DNSSEC for the domain.' };
}

// ── CAA ──
function caaFinding(caaQuery) {
  if (caaQuery === null) return { id: 'caa', section: 'dns', severity: 'unknown', title: 'CAA could not be read', detail: 'The DNS lookup did not complete. Try again in a moment.', fix: '' };
  if (caaQuery.status === NOERROR && (caaQuery.records || []).length > 0) {
    return { id: 'caa', section: 'dns', severity: 'good', title: 'CAA records are set', detail: 'You have named which certificate authorities may issue certificates for your domain, which stops a rogue CA from minting one.', fix: '' };
  }
  return { id: 'caa', section: 'dns', severity: 'low', title: 'No CAA record', detail: 'Without a CAA record, any certificate authority in the world is allowed to issue a certificate for your domain. A CAA record restricts that to the ones you actually use.', fix: 'Add a CAA DNS record naming your certificate authority, e.g. 0 issue "letsencrypt.org".' };
}

// ── Certificate transparency (crt.sh) ──
const INTERESTING_SUBDOMAIN =
  /(^|[.-])(dev|test|testing|stage|staging|uat|qa|preprod|internal|intranet|admin|adminpanel|vpn|git|gitlab|jenkins|jira|confluence|grafana|kibana|phpmyadmin|db|database|backup|old|legacy|beta|sandbox)([.-]|$)/i;

function issuerName(raw) {
  const m = /O=("?)([^,"]+)\1/.exec(String(raw || ''));
  return m ? m[2].trim() : String(raw || '').slice(0, 60) || 'an unknown authority';
}

/** Parse a crt.sh JSON array into subdomains and the latest certificate. */
function parseCrt(json, domain) {
  if (!Array.isArray(json)) return { known: false, subdomains: [], interesting: [], cert: null };
  const set = new Set();
  let latest = null;
  for (const row of json) {
    for (let n of String(row.name_value || '').split(/\s+/)) {
      n = n.trim().toLowerCase().replace(/^\*\./, '');
      if (n && n.endsWith('.' + domain) && n !== domain) set.add(n);
    }
    const na = Date.parse(row.not_after);
    if (!Number.isNaN(na) && (!latest || na > latest.na)) {
      latest = { na, notAfter: String(row.not_after), issuer: issuerName(row.issuer_name) };
    }
  }
  const subdomains = [...set].sort();
  return {
    known: true,
    subdomains,
    interesting: subdomains.filter((s) => INTERESTING_SUBDOMAIN.test(s)),
    cert: latest ? { issuer: latest.issuer, notAfter: latest.notAfter } : null,
  };
}

function certFinding(parsed) {
  if (!parsed.known) return { id: 'cert', section: 'certificates', severity: 'unknown', title: 'Certificate history could not be read', detail: 'The certificate transparency lookup did not complete. Try again in a moment.', fix: '' };
  if (!parsed.cert) return { id: 'cert', section: 'certificates', severity: 'low', title: 'No certificate found in public logs', detail: 'We found no certificate for this domain in the public transparency logs, which is unusual for a live site and can mean it does not serve HTTPS.', fix: '' };
  const exp = Date.parse(parsed.cert.notAfter);
  const day = parsed.cert.notAfter.slice(0, 10);
  if (!Number.isNaN(exp) && exp < Date.now()) {
    return { id: 'cert', section: 'certificates', severity: 'critical', title: 'The latest certificate has expired', detail: `The most recent certificate in public logs, from ${parsed.cert.issuer}, expired on ${day}. Visitors may be seeing security warnings.`, fix: 'Renew the certificate with your provider.' };
  }
  const days = Math.floor((exp - Date.now()) / 86400000);
  if (!Number.isNaN(exp) && days <= 14) {
    return { id: 'cert', section: 'certificates', severity: 'high', title: `Certificate expires in ${days} day${days === 1 ? '' : 's'}`, detail: `The certificate from ${parsed.cert.issuer} expires on ${day}. Renew it before then to avoid an outage or warnings.`, fix: 'Renew now, or turn on auto-renewal.' };
  }
  return { id: 'cert', section: 'certificates', severity: 'good', title: 'Certificate is current', detail: `The latest certificate, from ${parsed.cert.issuer}, is valid through ${day}.`, fix: '' };
}

function subdomainFinding(parsed) {
  if (!parsed.known) return { id: 'subdomains', section: 'certificates', severity: 'unknown', title: 'Subdomains could not be read', detail: 'The certificate transparency lookup did not complete. Try again in a moment.', fix: '' };
  const n = parsed.subdomains.length;
  if (parsed.interesting.length > 0) {
    return { id: 'subdomains', section: 'certificates', severity: 'medium', title: `${parsed.interesting.length} sensitive-looking subdomain${parsed.interesting.length === 1 ? '' : 's'} publicly listed`, detail: `Certificate transparency logs are public, and every certificate your domain has ever requested is recorded there. Among the ${n} we found are names that look like internal or non-production systems: ${parsed.interesting.slice(0, 8).join(', ')}. Anyone can discover these, so make sure they are meant to be reachable and are not a soft target.`, fix: 'Restrict or take down hosts that should not be internet-facing, and avoid descriptive names for sensitive systems.' };
  }
  return { id: 'subdomains', section: 'certificates', severity: 'good', title: n > 0 ? `${n} subdomain${n === 1 ? '' : 's'} found in public logs` : 'No extra subdomains in public logs', detail: n > 0 ? 'These are visible to anyone through certificate transparency logs. Nothing here looks obviously sensitive, but it is worth knowing what is discoverable.' : 'We found no additional subdomains recorded in the public certificate logs.', fix: '' };
}

// ── Public code repositories (GitHub search) ──
// Reads GitHub's public search index only; it never contacts the target.
// Surfacing public repositories that reference the domain is exactly what an
// attacker does in the first minute of recon, and it is where leaked config,
// internal hostnames and committed credentials tend to show up.
const SENSITIVE_REPO =
  /(^|[-_/])(internal|private|secret|secrets|credential|creds|config|configs|env|dotenv|infra|infrastructure|terraform|ansible|deploy|deployment|ops|devops|backend|admin|db|database|backup|dump|vault|k8s|kube|prod|production|staging|apikeys?|api-keys?)([-_/]|$)/i;

/** Parse a GitHub repository-search response. Null-safe, never invents data. */
function parseGithubRepos(json) {
  if (!json || !Array.isArray(json.items)) {
    return { known: false, repos: [], total: 0, sensitive: [] };
  }
  const repos = json.items
    .map((r) => ({
      name: String(r.full_name || ''),
      url: String(r.html_url || ''),
      description: String(r.description || '').slice(0, 160),
    }))
    .filter((r) => r.name);
  const sensitive = repos.filter((r) => SENSITIVE_REPO.test(r.name)).map((r) => r.name);
  return { known: true, repos, total: Number(json.total_count || repos.length), sensitive };
}

function githubRepoFinding(parsed, domain) {
  // Not configured or could not be read: omit the finding rather than cry wolf.
  if (!parsed || !parsed.known) return null;
  if (parsed.total === 0) {
    return { id: 'repos', section: 'code', severity: 'good', title: 'No public repositories reference your domain', detail: `We searched GitHub's public index and found no public repositories mentioning ${domain}. Nothing about your code is discoverable there.`, fix: '' };
  }
  if (parsed.sensitive.length > 0) {
    const names = parsed.sensitive.slice(0, 6).join(', ');
    return { id: 'repos', section: 'code', severity: 'medium', title: `${parsed.sensitive.length} sensitive-looking public repositor${parsed.sensitive.length === 1 ? 'y' : 'ies'} mention your domain`, detail: `Public GitHub repositories are searchable by anyone. Of the ${parsed.total} that mention ${domain}, some carry names that suggest internal or infrastructure code: ${names}. If any of these are yours and were not meant to be public, they can leak configuration, internal hostnames or credentials, including in old commit history.`, fix: 'Review each one. Make private anything internal, and rotate any secret that was ever committed, even if it was later deleted.' };
  }
  return { id: 'repos', section: 'code', severity: 'low', title: `${parsed.total} public repositor${parsed.total === 1 ? 'y' : 'ies'} mention your domain`, detail: `Public GitHub repositories mentioning ${domain} are discoverable by anyone. None look obviously sensitive, but it is worth confirming that each is meant to be public and carries no secrets in its history.`, fix: 'Confirm each is intentionally public and free of committed credentials.' };
}

function composeHeadline(byId, worst) {
  if (byId.cert && byId.cert.severity === 'critical') return 'Your TLS certificate has expired.';
  if (byId.spf && byId.spf.severity === 'critical') return 'Right now, anyone can send email as you.';
  if (byId.cert && byId.cert.severity === 'high') return `${byId.cert.title}.`;
  if (byId.dmarc && byId.dmarc.severity === 'high') return 'Your domain can still be spoofed.';
  if (byId.repos && byId.repos.severity === 'medium') return 'Code that mentions you is sitting in public repositories.';
  if (byId.subdomains && byId.subdomains.severity === 'medium') return 'Systems you may have forgotten are publicly listed.';
  if (byId.dmarc && byId.dmarc.severity === 'medium') return 'You are close on email, but not enforcing it yet.';
  if (byId.dkim && byId.dkim.severity === 'medium') return 'Your email signing looks incomplete.';
  if (byId.hsts && byId.hsts.severity === 'medium') return 'Your site is missing a browser protection worth adding.';
  if (worst === 'unknown') return 'We could not finish every check. Try again in a moment.';
  if (worst === 'low') return 'Well managed, with a couple of small things to tighten.';
  return 'Your public exposure looks well managed.';
}

/**
 * Assemble the full passive report from every read part. Each part is a
 * record state or DoH/crt result; nothing here contacts the target.
 */
function composeReport(domain, parts) {
  const email = analyze(domain, { spf: parts.spf, dmarc: parts.dmarc, mx: parts.mx });
  const github = parseGithubRepos(parts.github);
  // The live section only appears when the site was actually reachable. An
  // unreachable site is not a security finding, so we omit it rather than
  // add noise, keeping to the never-cry-wolf rule.
  const live = parts.live && parts.live.reachable ? liveFindings(parts.live.headers, parts.live.securityTxt) : [];
  const findings = [
    ...email.findings.map((f) => ({ ...f, section: 'email' })),
    dkimFinding(parts.dkim, domain),
    dnssecFinding(parts.dnssecQuery),
    caaFinding(parts.caaQuery),
    subdomainFinding(parts.crt),
    certFinding(parts.crt),
    githubRepoFinding(github, domain),
    ...live,
  ].filter(Boolean); // a check that is not configured returns null and is dropped

  let worst = 'good';
  for (const f of findings) {
    if (SEV_RANK[f.severity] !== undefined && SEV_RANK[f.severity] > SEV_RANK[worst]) worst = f.severity;
  }
  if (worst === 'good' && findings.some((f) => f.severity === 'unknown')) worst = 'unknown';

  const byId = Object.fromEntries(findings.map((f) => [f.id, f]));
  return {
    domain,
    findings,
    subdomains: parts.crt.known
      ? { list: parts.crt.subdomains.slice(0, 60), total: parts.crt.subdomains.length, interesting: parts.crt.interesting }
      : null,
    repositories: github.known
      ? { list: github.repos.slice(0, 30), total: github.total, sensitive: github.sensitive }
      : null,
    worst,
    headline: composeHeadline(byId, worst),
  };
}

// ── Live check (opt-in) ──
// Everything above is passive. This one is different: it is only ever run
// after the visitor asks for it, and it works from a single ordinary HTTPS
// request to the site's home page, the same request a browser makes on a
// visit. It reads only the response (headers and a security.txt lookup); it
// never probes ports, paths or anything a normal visit would not touch.

/**
 * Is an IP address one we must never connect to from a server (loopback,
 * private, link-local, cloud metadata)? The live check resolves the domain
 * first and refuses if it points anywhere internal, so it cannot be turned
 * into a server-side request forgery tool.
 */
function isPrivateIp(ip) {
  const s = String(ip || '').trim().toLowerCase();
  if (!s) return true;
  // IPv4-mapped IPv6 (::ffff:10.0.0.1) — test the embedded v4.
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(s);
  const v4 = mapped ? mapped[1] : (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(s) ? s : null);
  if (v4) {
    const p = v4.split('.').map(Number);
    if (p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
    const [a, b] = p;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  // IPv6
  if (s === '::1' || s === '::') return true;
  if (s.startsWith('fe80') || s.startsWith('fc') || s.startsWith('fd')) return true; // link-local, ULA
  return false;
}

function liveGood(id, title, detail) {
  return { id, section: 'live', severity: 'good', title, detail, fix: '' };
}
function liveLow(id, title, detail, fix) {
  return { id, section: 'live', severity: 'low', title, detail, fix };
}

/** headers: a lowercased-key object of response headers. securityTxt: boolean. */
function liveFindings(headers, securityTxt) {
  const h = headers || {};
  const has = (k) => typeof h[k] === 'string' && h[k].trim().length > 0;
  const csp = h['content-security-policy'] || '';
  const findings = [];

  findings.push(
    has('strict-transport-security')
      ? liveGood('hsts', 'HSTS is enabled', 'Browsers are told to reach you over HTTPS only, which shuts the door on a plain-HTTP downgrade.')
      : { id: 'hsts', section: 'live', severity: 'medium', title: 'No HSTS header', detail: 'Without HSTS, a browser can be talked into connecting over plain HTTP first, which is exactly where a network attacker downgrades or reads the traffic.', fix: 'Send Strict-Transport-Security: max-age=63072000; includeSubDomains on every HTTPS response.' },
  );

  findings.push(
    csp
      ? liveGood('csp', 'A Content Security Policy is set', 'You have a defence-in-depth layer against scripts an attacker manages to inject into your pages.')
      : liveLow('csp', 'No Content Security Policy', 'A CSP is the main protection against injected or malicious scripts running on your pages. Without one, a single injection has free rein.', 'Add a Content-Security-Policy header, starting in report-only mode so it cannot break the site.'),
  );

  findings.push(
    /nosniff/i.test(h['x-content-type-options'] || '')
      ? liveGood('nosniff', 'MIME sniffing is disabled', 'Browsers respect the content types you declare instead of guessing.')
      : liveLow('nosniff', 'No X-Content-Type-Options header', 'Without nosniff, a browser may guess the type of a file and run something you served as data as if it were code.', 'Send X-Content-Type-Options: nosniff on all responses.'),
  );

  findings.push(
    has('x-frame-options') || /frame-ancestors/i.test(csp)
      ? liveGood('frame', 'Clickjacking protection is in place', 'Other sites cannot load yours inside a hidden frame.')
      : liveLow('frame', 'No clickjacking protection', 'Nothing stops another site from loading yours inside an invisible frame to trick your users into clicking things they cannot see.', 'Send X-Frame-Options: DENY, or a Content-Security-Policy frame-ancestors directive.'),
  );

  findings.push(
    has('referrer-policy')
      ? liveGood('referrer', 'A Referrer-Policy is set', 'You control how much of your URLs is leaked to other sites your users click through to.')
      : liveLow('referrer', 'No Referrer-Policy', 'Without a policy, full URLs from your site, which can carry tokens or internal paths, are handed to every external site your users visit next.', 'Send Referrer-Policy: strict-origin-when-cross-origin.'),
  );

  const server = h['server'] || '';
  if (/\d/.test(server)) {
    findings.push(liveLow('server', 'Your server software version is exposed', `The Server header advertises "${server.slice(0, 60)}", which hands an attacker the exact software and version to look up known vulnerabilities against.`, 'Configure your server or CDN to drop version numbers from the Server header.'));
  }

  findings.push(
    securityTxt
      ? liveGood('securitytxt', 'A security.txt is published', 'A researcher who finds a problem has a standard, published way to tell you.')
      : liveLow('securitytxt', 'No security.txt', 'There is no published, standard way for a security researcher to report a vulnerability to you, so a warning that could have reached you may get lost or never sent.', 'Publish /.well-known/security.txt (RFC 9116) with a contact address.'),
  );

  return findings;
}

/** parts: { reachable, headers, securityTxt }. Returns the live report. */
function composeLive(domain, parts) {
  if (!parts || !parts.reachable) {
    return {
      domain,
      findings: [{ id: 'reach', section: 'live', severity: 'unknown', title: 'We could not reach your site over HTTPS', detail: 'The live request did not complete. The site may be down, may not serve HTTPS, or may be blocking automated requests. This is not a verdict about your security.', fix: '' }],
      worst: 'unknown',
      headline: 'We could not reach your site to check it.',
    };
  }
  const findings = liveFindings(parts.headers, parts.securityTxt);
  let worst = 'good';
  for (const f of findings) {
    if (SEV_RANK[f.severity] !== undefined && SEV_RANK[f.severity] > SEV_RANK[worst]) worst = f.severity;
  }
  let headline;
  if (worst === 'medium') headline = 'A few of the protections a browser looks for are missing.';
  else if (worst === 'low') headline = 'Solid. A few hardening headers left to add.';
  else headline = 'Your site sends the browser protections we look for.';
  return { domain, findings, worst, headline };
}

module.exports = {
  NOERROR,
  NXDOMAIN,
  COMMON_DKIM_SELECTORS,
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
  dkimState,
  dkimFinding,
  dnssecFinding,
  caaFinding,
  parseCrt,
  certFinding,
  subdomainFinding,
  parseGithubRepos,
  githubRepoFinding,
  composeReport,
  isPrivateIp,
  liveFindings,
  composeLive,
};

// Exposure-scan logic: domain validation, the DoH-status-to-state mapping
// (the part that keeps a failed lookup from reading as exposure), and the
// findings engine. Pure functions only, so no network is touched here.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  NOERROR,
  NXDOMAIN,
  normalizeDomain,
  txtState,
  mxState,
  allFailed,
  domainNotFound,
  findSpf,
  findDmarc,
  analyze,
  dkimState,
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
} = require('../src/lib/scan.js');

// ── normalizeDomain ──
assert.equal(normalizeDomain('Example.com'), 'example.com');
assert.equal(normalizeDomain('https://www.Example.com/path?x=1'), 'example.com');
assert.equal(normalizeDomain('  ACME.CO.UK. '), 'acme.co.uk');
assert.equal(normalizeDomain('someone@nimbus.dev'), 'nimbus.dev');
assert.equal(normalizeDomain('example.com:8080'), 'example.com');
assert.equal(normalizeDomain(''), null);
assert.equal(normalizeDomain('localhost'), null);
assert.equal(normalizeDomain('192.168.0.1'), null);
assert.equal(normalizeDomain('box.local'), null);
assert.equal(normalizeDomain('nodot'), null);
assert.equal(normalizeDomain('-bad.com'), null);
assert.equal(normalizeDomain('bad-.com'), null);

// ── txtState: known vs unknown ──
const good = { status: NOERROR, records: ['"v=spf1 -all"'] };
assert.deepEqual(txtState(good, findSpf), { known: true, record: 'v=spf1 -all' });
assert.deepEqual(txtState({ status: NOERROR, records: [] }, findSpf), { known: true, record: null });
assert.deepEqual(txtState({ status: NXDOMAIN, records: [] }, findSpf), { known: true, record: null });
// Transport failure and SERVFAIL are UNKNOWN, never "absent".
assert.deepEqual(txtState(null, findSpf), { known: false, record: null });
assert.deepEqual(txtState({ status: 2, records: [] }, findSpf), { known: false, record: null });
// Chunked TXT joins before matching.
assert.deepEqual(
  txtState({ status: NOERROR, records: ['"v=spf1 a " "include:x.com -all"'] }, findSpf),
  { known: true, record: 'v=spf1 a include:x.com -all' },
);

// ── mxState ──
assert.deepEqual(mxState({ status: NOERROR, records: ['10 mail.x.com.'] }), { known: true, hasMx: true });
assert.deepEqual(mxState({ status: NOERROR, records: [] }), { known: true, hasMx: false });
assert.deepEqual(mxState(null), { known: false, hasMx: false });
assert.deepEqual(mxState({ status: 2, records: [] }), { known: false, hasMx: false });

// ── allFailed ──
assert.equal(allFailed(null, null, null), true);
assert.equal(allFailed(null, { status: 0, records: [] }, null), false);

// ── domainNotFound: only NXDOMAIN with no NOERROR counts ──
assert.equal(domainNotFound({ status: NXDOMAIN, records: [] }, { status: NXDOMAIN, records: [] }), true);
assert.equal(domainNotFound({ status: NXDOMAIN, records: [] }, null), true);
assert.equal(domainNotFound({ status: NOERROR, records: [] }, { status: NXDOMAIN, records: [] }), false, 'exists via TXT');
assert.equal(domainNotFound(null, null), false, 'transient failure is not "not found"');
assert.equal(domainNotFound({ status: 2, records: [] }, { status: 2, records: [] }), false, 'SERVFAIL is not "not found"');

// ── analyze: worst case, nothing published (all read, genuinely absent) ──
const S = (record) => ({ known: true, record });
const M = (hasMx) => ({ known: true, hasMx });
const wide = analyze('acme.com', { spf: S(null), dmarc: S(null), mx: M(true) });
assert.equal(wide.worst, 'critical');
assert.match(wide.headline, /anyone can send email as you/i);

// SPF present, no DMARC
const spfOnly = analyze('acme.com', { spf: S('v=spf1 -all'), dmarc: S(null), mx: M(true) });
assert.equal(spfOnly.worst, 'high');

// DMARC monitor-only
const monitor = analyze('acme.com', { spf: S('v=spf1 -all'), dmarc: S('v=DMARC1; p=none'), mx: M(true) });
assert.equal(monitor.worst, 'medium');

// Fully enforcing
const locked = analyze('acme.com', { spf: S('v=spf1 -all'), dmarc: S('v=DMARC1; p=reject'), mx: M(true) });
assert.equal(locked.worst, 'good');
assert.match(locked.headline, /locked down/i);

// ── the critical fix: an unreadable SPF is UNKNOWN, never critical ──
const unknownSpf = analyze('acme.com', { spf: { known: false, record: null }, dmarc: S('v=DMARC1; p=reject'), mx: M(true) });
assert.equal(unknownSpf.findings.find((f) => f.id === 'spf').severity, 'unknown');
assert.equal(unknownSpf.worst, 'unknown', 'no genuine problem, but a check did not complete');
assert.match(unknownSpf.headline, /could not finish/i);
assert.doesNotMatch(unknownSpf.headline, /anyone can send email/i);

// A healthy SPF with an unreadable DMARC does not claim "locked down".
const unknownDmarc = analyze('acme.com', { spf: S('v=spf1 -all'), dmarc: { known: false, record: null }, mx: M(true) });
assert.equal(unknownDmarc.worst, 'unknown');
assert.match(unknownDmarc.headline, /could not read DMARC/i);

// A genuine SPF gap still wins even when DMARC is unreadable.
const gapWithUnknown = analyze('acme.com', { spf: S(null), dmarc: { known: false, record: null }, mx: M(true) });
assert.equal(gapWithUnknown.worst, 'critical');

// MX unreadable: no MX finding is emitted, and it does not affect the verdict.
const noMxRead = analyze('acme.com', { spf: S('v=spf1 -all'), dmarc: S('v=DMARC1; p=reject'), mx: { known: false, hasMx: false } });
assert.equal(noMxRead.findings.some((f) => f.id === 'mx'), false);
assert.equal(noMxRead.worst, 'good');

// ── DKIM selector detection ──
const okTxt = (rec) => ({ status: NOERROR, records: [`"${rec}"`] });
assert.deepEqual(
  dkimState([{ selector: 'selector1', query: okTxt('v=DKIM1; k=rsa; p=MIGf...') }]),
  { known: true, found: true, selector: 'selector1' },
);
assert.deepEqual(
  dkimState([{ selector: 'selector1', query: { status: NXDOMAIN, records: [] } }]),
  { known: true, found: false, selector: null },
);
assert.deepEqual(
  dkimState([{ selector: 'selector1', query: null }]),
  { known: false, found: false, selector: null },
  'all-failed selector lookups are unknown, not "no DKIM"',
);
// First selector missing, second present.
assert.equal(
  dkimState([
    { selector: 'selector1', query: { status: NXDOMAIN, records: [] } },
    { selector: 'google', query: okTxt('v=DKIM1; p=abc') },
  ]).selector,
  'google',
);

// ── DNSSEC / CAA findings ──
assert.equal(dnssecFinding({ status: NOERROR, records: ['DS 12345 ...'] }).severity, 'good');
assert.equal(dnssecFinding({ status: NOERROR, records: [] }).severity, 'low');
assert.equal(dnssecFinding(null).severity, 'unknown');
assert.equal(caaFinding({ status: NOERROR, records: ['0 issue "letsencrypt.org"'] }).severity, 'good');
assert.equal(caaFinding({ status: NOERROR, records: [] }).severity, 'low');
assert.equal(caaFinding(null).severity, 'unknown');

// ── crt.sh parsing: dedup, wildcard strip, subdomain filter, latest cert ──
const crtRows = [
  { name_value: 'acme.com\n*.acme.com', not_after: '2099-01-01T00:00:00', issuer_name: 'C=US, O=Let\'s Encrypt, CN=R3' },
  { name_value: 'www.acme.com', not_after: '2030-06-01T00:00:00', issuer_name: 'O="DigiCert Inc"' },
  { name_value: 'staging.acme.com\nadmin.acme.com', not_after: '2028-01-01T00:00:00', issuer_name: 'O=Let\'s Encrypt' },
  { name_value: 'other-domain.com', not_after: '2031-01-01T00:00:00', issuer_name: 'O=Whatever' },
];
const crt = parseCrt(crtRows, 'acme.com');
assert.deepEqual(crt.subdomains, ['admin.acme.com', 'staging.acme.com', 'www.acme.com'], 'apex, wildcard and foreign domains excluded');
assert.deepEqual(crt.interesting, ['admin.acme.com', 'staging.acme.com']);
assert.equal(crt.cert.issuer, "Let's Encrypt", 'latest cert by not_after, issuer O= extracted');
assert.equal(crt.cert.notAfter.slice(0, 10), '2099-01-01');
assert.deepEqual(parseCrt(null, 'acme.com'), { known: false, subdomains: [], interesting: [], cert: null });

// ── cert findings by expiry ──
const soon = new Date(Date.now() + 5 * 86400000).toISOString();
const past = new Date(Date.now() - 86400000).toISOString();
assert.equal(certFinding({ known: true, cert: { issuer: 'X', notAfter: past } }).severity, 'critical');
assert.equal(certFinding({ known: true, cert: { issuer: 'X', notAfter: soon } }).severity, 'high');
assert.equal(certFinding({ known: true, cert: { issuer: 'X', notAfter: '2099-01-01T00:00:00' } }).severity, 'good');
assert.equal(certFinding({ known: true, cert: null }).severity, 'low');
assert.equal(certFinding({ known: false }).severity, 'unknown');

// ── subdomain findings ──
assert.equal(subdomainFinding({ known: true, subdomains: ['a.acme.com'], interesting: [] }).severity, 'good');
assert.equal(subdomainFinding({ known: true, subdomains: ['admin.acme.com'], interesting: ['admin.acme.com'] }).severity, 'medium');
assert.equal(subdomainFinding({ known: false }).severity, 'unknown');

// ── composeReport: full assembly, worst + headline priority ──
const healthy = composeReport('acme.com', {
  spf: { known: true, record: 'v=spf1 -all' },
  dmarc: { known: true, record: 'v=DMARC1; p=reject' },
  mx: { known: true, hasMx: true },
  dkim: { known: true, found: true, selector: 'selector1' },
  dnssecQuery: { status: NOERROR, records: ['DS ...'] },
  caaQuery: { status: NOERROR, records: ['0 issue "x"'] },
  crt: { known: true, subdomains: ['www.acme.com'], interesting: [], cert: { issuer: 'X', notAfter: '2099-01-01T00:00:00' } },
});
assert.equal(healthy.worst, 'good');
assert.equal(healthy.subdomains.total, 1);
assert.ok(healthy.findings.every((f) => f.section));
assert.match(healthy.headline, /well managed/i);

// An expired cert outranks everything for the headline.
const expired = composeReport('acme.com', {
  spf: { known: true, record: 'v=spf1 -all' },
  dmarc: { known: true, record: 'v=DMARC1; p=reject' },
  mx: { known: true, hasMx: true },
  dkim: { known: true, found: true, selector: 'x' },
  dnssecQuery: { status: NOERROR, records: ['DS'] },
  caaQuery: { status: NOERROR, records: ['x'] },
  crt: { known: true, subdomains: [], interesting: [], cert: { issuer: 'X', notAfter: past } },
});
assert.equal(expired.worst, 'critical');
assert.match(expired.headline, /certificate has expired/i);

// Exposed subdomains drive the headline when nothing worse exists.
const exposed = composeReport('acme.com', {
  spf: { known: true, record: 'v=spf1 -all' },
  dmarc: { known: true, record: 'v=DMARC1; p=reject' },
  mx: { known: true, hasMx: true },
  dkim: { known: true, found: true, selector: 'x' },
  dnssecQuery: { status: NOERROR, records: ['DS'] },
  caaQuery: { status: NOERROR, records: ['x'] },
  crt: { known: true, subdomains: ['admin.acme.com'], interesting: ['admin.acme.com'], cert: { issuer: 'X', notAfter: '2099-01-01T00:00:00' } },
});
assert.equal(exposed.worst, 'medium');
assert.match(exposed.headline, /forgotten/i);

// ── GitHub public-repository exposure ──

// A search response with no items reads as clean, not unknown.
const ghEmpty = parseGithubRepos({ total_count: 0, items: [] });
assert.equal(ghEmpty.known, true);
assert.equal(ghEmpty.total, 0);
assert.equal(githubRepoFinding(ghEmpty, 'acme.com').severity, 'good');

// A missing/failed search is unknown, and the finding is dropped (null), so a
// domain with GitHub search unconfigured never shows a false result.
const ghNull = parseGithubRepos(null);
assert.equal(ghNull.known, false);
assert.equal(githubRepoFinding(ghNull, 'acme.com'), null);

// Sensitive-looking repo names are flagged and drive a medium finding.
const ghSensitive = parseGithubRepos({
  total_count: 3,
  items: [
    { full_name: 'acme/website', html_url: 'https://github.com/acme/website', description: 'marketing site' },
    { full_name: 'acme/internal-infra', html_url: 'https://github.com/acme/internal-infra', description: 'terraform' },
    { full_name: 'acme/blog', html_url: 'https://github.com/acme/blog', description: '' },
  ],
});
assert.equal(ghSensitive.known, true);
assert.equal(ghSensitive.total, 3);
assert.deepEqual(ghSensitive.sensitive, ['acme/internal-infra']);
const ghFind = githubRepoFinding(ghSensitive, 'acme.com');
assert.equal(ghFind.severity, 'medium');
assert.equal(ghFind.section, 'code');
assert.match(ghFind.title, /1 sensitive-looking/);

// Public repos with nothing sensitive-looking are low, not medium.
const ghPlain = parseGithubRepos({
  total_count: 2,
  items: [
    { full_name: 'acme/website', html_url: 'https://github.com/acme/website', description: '' },
    { full_name: 'acme/docs', html_url: 'https://github.com/acme/docs', description: '' },
  ],
});
assert.equal(githubRepoFinding(ghPlain, 'acme.com').severity, 'low');

// composeReport folds the GitHub finding in and exposes a repositories block.
const withRepos = composeReport('acme.com', {
  spf: { known: true, record: 'v=spf1 -all' },
  dmarc: { known: true, record: 'v=DMARC1; p=reject' },
  mx: { known: true, hasMx: true },
  dkim: { known: true, found: true, selector: 'x' },
  dnssecQuery: { status: NOERROR, records: ['DS'] },
  caaQuery: { status: NOERROR, records: ['x'] },
  crt: { known: true, subdomains: [], interesting: [], cert: { issuer: 'X', notAfter: '2099-01-01T00:00:00' } },
  github: { total_count: 1, items: [{ full_name: 'acme/secrets', html_url: 'https://github.com/acme/secrets', description: '' }] },
});
assert.ok(withRepos.repositories);
assert.equal(withRepos.repositories.total, 1);
assert.deepEqual(withRepos.repositories.sensitive, ['acme/secrets']);
assert.equal(withRepos.worst, 'medium');
assert.match(withRepos.headline, /public repositories/i);
assert.ok(withRepos.findings.some((f) => f.id === 'repos' && f.section === 'code'));

// With GitHub unconfigured, the report omits the section and repositories is null.
const noRepos = composeReport('acme.com', {
  spf: { known: true, record: 'v=spf1 -all' },
  dmarc: { known: true, record: 'v=DMARC1; p=reject' },
  mx: { known: true, hasMx: true },
  dkim: { known: true, found: true, selector: 'x' },
  dnssecQuery: { status: NOERROR, records: ['DS'] },
  caaQuery: { status: NOERROR, records: ['x'] },
  crt: { known: true, subdomains: [], interesting: [], cert: { issuer: 'X', notAfter: '2099-01-01T00:00:00' } },
  github: null,
});
assert.equal(noRepos.repositories, null);
assert.equal(noRepos.worst, 'good');
assert.ok(!noRepos.findings.some((f) => f.id === 'repos'));

// ── Live check: SSRF guard ──

// Everything internal must be refused; only real public IPs pass.
for (const bad of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fe80::1', 'fc00::1', 'fd12::1', '::ffff:10.0.0.1', '']) {
  assert.equal(isPrivateIp(bad), true, `expected ${bad} to be treated as private`);
}
for (const ok of ['8.8.8.8', '1.1.1.1', '104.18.0.1', '172.15.0.1', '172.32.0.1', '2606:4700::1']) {
  assert.equal(isPrivateIp(ok), false, `expected ${ok} to be treated as public`);
}

// ── Live check: header analysis ──

// A fully hardened site scores good across the board.
const strong = liveFindings(
  {
    'strict-transport-security': 'max-age=63072000; includeSubDomains',
    'content-security-policy': "default-src 'self'; frame-ancestors 'none'",
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
  },
  true,
);
assert.ok(strong.every((f) => f.severity === 'good'));

// A bare site: missing HSTS is medium, the rest are low, security.txt absent.
const bare = liveFindings({}, false);
assert.equal(bare.find((f) => f.id === 'hsts').severity, 'medium');
assert.equal(bare.find((f) => f.id === 'csp').severity, 'low');
assert.equal(bare.find((f) => f.id === 'securitytxt').severity, 'low');
// A server header with a version leaks; a bare object adds no server finding.
assert.ok(!bare.some((f) => f.id === 'server'));
const leaky = liveFindings({ server: 'nginx/1.18.0' }, false);
assert.equal(leaky.find((f) => f.id === 'server').severity, 'low');

// composeLive rolls findings into a verdict, and handles an unreachable site.
const liveStrong = composeLive('acme.com', {
  reachable: true,
  headers: {
    'strict-transport-security': 'max-age=1',
    'content-security-policy': "default-src 'self'",
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
  },
  securityTxt: true,
});
assert.equal(liveStrong.worst, 'good');
const liveBare = composeLive('acme.com', { reachable: true, headers: {}, securityTxt: false });
assert.equal(liveBare.worst, 'medium');
const unreachable = composeLive('acme.com', { reachable: false });
assert.equal(unreachable.worst, 'unknown');
assert.match(unreachable.headline, /could not reach/i);

// ── Live check folds into the main report ──

const healthyBase = {
  spf: { known: true, record: 'v=spf1 -all' },
  dmarc: { known: true, record: 'v=DMARC1; p=reject' },
  mx: { known: true, hasMx: true },
  dkim: { known: true, found: true, selector: 'x' },
  dnssecQuery: { status: NOERROR, records: ['DS'] },
  caaQuery: { status: NOERROR, records: ['x'] },
  crt: { known: true, subdomains: [], interesting: [], cert: { issuer: 'X', notAfter: '2099-01-01T00:00:00' } },
  github: null,
};

// A reachable but bare site adds live findings under section 'live' and drives
// the verdict to medium (missing HSTS).
const withLive = composeReport('acme.com', {
  ...healthyBase,
  live: { reachable: true, headers: {}, securityTxt: false },
});
assert.ok(withLive.findings.some((f) => f.section === 'live' && f.id === 'hsts'));
assert.equal(withLive.worst, 'medium');
assert.match(withLive.headline, /browser protection/i);

// An unreachable site adds no live noise, and the rest of the report stands.
const liveDown = composeReport('acme.com', {
  ...healthyBase,
  live: { reachable: false },
});
assert.ok(!liveDown.findings.some((f) => f.section === 'live'));
assert.equal(liveDown.worst, 'good');

console.log('exposure scan logic: all assertions passed');

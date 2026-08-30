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

console.log('exposure scan logic: all assertions passed');

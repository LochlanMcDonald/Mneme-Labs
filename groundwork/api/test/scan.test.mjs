// Exposure-scan logic: domain validation and the DNS-to-findings engine.
// Pure functions only, so no network is touched here.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { normalizeDomain, analyze } = require('../src/lib/scan.js');

// ── normalizeDomain ──
assert.equal(normalizeDomain('Example.com'), 'example.com');
assert.equal(normalizeDomain('https://www.Example.com/path?x=1'), 'example.com');
assert.equal(normalizeDomain('  ACME.CO.UK. '), 'acme.co.uk');
assert.equal(normalizeDomain('someone@nimbus.dev'), 'nimbus.dev');
assert.equal(normalizeDomain('example.com:8080'), 'example.com');
// Rejections
assert.equal(normalizeDomain(''), null);
assert.equal(normalizeDomain('localhost'), null);
assert.equal(normalizeDomain('192.168.0.1'), null);
assert.equal(normalizeDomain('box.local'), null);
assert.equal(normalizeDomain('nodot'), null);
assert.equal(normalizeDomain('-bad.com'), null);
assert.equal(normalizeDomain('bad-.com'), null);

// ── analyze: worst case, nothing published ──
const wide = analyze('acme.com', { domainTxt: [], dmarcTxt: [], mx: ['10 mail.acme.com.'] });
assert.equal(wide.worst, 'critical');
assert.match(wide.headline, /anyone can send email as you/i);
assert.equal(wide.findings.find((f) => f.id === 'spf').severity, 'critical');
assert.equal(wide.findings.find((f) => f.id === 'dmarc').severity, 'high');

// ── SPF present but no DMARC ──
const spfOnly = analyze('acme.com', {
  domainTxt: ['v=spf1 include:_spf.google.com -all'],
  dmarcTxt: [],
  mx: ['10 mail.acme.com.'],
});
assert.equal(spfOnly.findings.find((f) => f.id === 'spf').severity, 'good');
assert.equal(spfOnly.findings.find((f) => f.id === 'dmarc').severity, 'high');
assert.equal(spfOnly.worst, 'high');

// ── DMARC monitor-only ──
const monitor = analyze('acme.com', {
  domainTxt: ['v=spf1 -all'],
  dmarcTxt: ['v=DMARC1; p=none; rua=mailto:x@acme.com'],
  mx: ['10 mail.acme.com.'],
});
assert.equal(monitor.findings.find((f) => f.id === 'dmarc').severity, 'medium');
assert.equal(monitor.worst, 'medium');

// ── Fully enforcing ──
const locked = analyze('acme.com', {
  domainTxt: ['v=spf1 include:_spf.google.com -all'],
  dmarcTxt: ['v=DMARC1; p=reject; rua=mailto:x@acme.com'],
  mx: ['10 mail.acme.com.'],
});
assert.equal(locked.worst, 'good');
assert.match(locked.findings.find((f) => f.id === 'dmarc').title, /p=reject/);
assert.match(locked.headline, /locked down/i);

// ── No mail servers softens the MX line but SPF gap still stands ──
const noMx = analyze('acme.com', { domainTxt: [], dmarcTxt: [], mx: [] });
assert.equal(noMx.findings.find((f) => f.id === 'mx').title, 'No mail servers found');
assert.equal(noMx.worst, 'critical');

console.log('exposure scan logic: all assertions passed');

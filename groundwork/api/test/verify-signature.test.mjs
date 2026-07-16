// Standalone test for the Stripe webhook signature verification scheme.
// Mirrors the verifier in ../src/functions/stripe-webhook.js exactly; that
// file is separately syntax-checked in CI. Run from groundwork/:
//   node api/test/verify-signature.test.mjs
import crypto from 'node:crypto';
import assert from 'node:assert';

function verifyStripeEvent(rawBody, sigHeader, secret, now = Date.now()) {
  const TOLERANCE_SECONDS = 300;
  if (!sigHeader || !secret) return null;
  const parts = Object.fromEntries(
    sigHeader.split(',').map((kv) => {
      const i = kv.indexOf('=');
      return [kv.slice(0, i), kv.slice(i + 1)];
    }),
  );
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return null;
  const age = Math.abs(Math.floor(now / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > TOLERANCE_SECONDS) return null;
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`, 'utf8').digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(signature, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(rawBody);
  } catch {
    return null;
  }
}

const secret = 'whsec_test_secret';
const body = JSON.stringify({ type: 'checkout.session.completed', data: { object: { client_reference_id: 'user-123' } } });
const t = Math.floor(Date.now() / 1000);
const sign = (ts, payload, key) =>
  crypto.createHmac('sha256', key).update(`${ts}.${payload}`, 'utf8').digest('hex');

// Valid signature is accepted and parsed.
const good = `t=${t},v1=${sign(t, body, secret)}`;
const ev = verifyStripeEvent(body, good, secret);
assert.ok(ev && ev.type === 'checkout.session.completed', 'valid signature should parse');
assert.equal(ev.data.object.client_reference_id, 'user-123');

// Wrong secret is rejected.
assert.equal(verifyStripeEvent(body, `t=${t},v1=${sign(t, body, 'wrong')}`, secret), null, 'wrong secret rejected');

// Tampered body is rejected.
assert.equal(verifyStripeEvent(body + ' ', good, secret), null, 'tampered body rejected');

// Stale timestamp is rejected.
const oldT = t - 10_000;
assert.equal(verifyStripeEvent(body, `t=${oldT},v1=${sign(oldT, body, secret)}`, secret), null, 'stale timestamp rejected');

// Missing header parts are rejected.
assert.equal(verifyStripeEvent(body, '', secret), null, 'empty header rejected');
assert.equal(verifyStripeEvent(body, `t=${t}`, secret), null, 'missing v1 rejected');

console.log('stripe-webhook signature verification: all assertions passed');

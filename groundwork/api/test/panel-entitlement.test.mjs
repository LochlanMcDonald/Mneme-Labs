// Purchase classification: Pro and Panel share one webhook, and these
// assertions pin down which entitlement each checkout grants.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PANEL_PRODUCT_ID, classifyPurchase, subscriptionIsPanel } = require('../src/lib/purchases.js');

// With line-item products known, the product decides regardless of amount.
assert.equal(classifyPurchase([PANEL_PRODUCT_ID], 1499), 'panel');
assert.equal(classifyPurchase([PANEL_PRODUCT_ID], 0), 'panel', 'trial checkout still grants panel');
assert.equal(classifyPurchase(['prod_pro_something'], 29900), 'pro');
assert.equal(classifyPurchase(['prod_pro_something'], 1499), 'pro', 'product beats amount');

// Without products (no STRIPE_SECRET_KEY), the amount heuristic applies.
assert.equal(classifyPurchase(null, 1499), 'panel');
assert.equal(classifyPurchase(null, 29900), 'pro');
assert.equal(classifyPurchase([], 29900), 'pro', 'empty product list falls back to amount');

// Subscription payloads: only Panel subscriptions trigger revocation.
assert.equal(
  subscriptionIsPanel({ items: { data: [{ price: { product: PANEL_PRODUCT_ID } }] } }),
  true,
);
assert.equal(
  subscriptionIsPanel({ items: { data: [{ price: { product: 'prod_pro_something' } }] } }),
  false,
);
assert.equal(subscriptionIsPanel({}), false, 'malformed payload is not panel');

console.log('panel entitlement classification: all assertions passed');

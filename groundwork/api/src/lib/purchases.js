// Telling purchases apart. Pro and Panel arrive at the same webhook, so
// the product on the checkout session decides which entitlement to grant.
// The reliable way to learn the product is Stripe's line-items API (needs
// STRIPE_SECRET_KEY); without a key we fall back to the charged amount,
// which works for the current prices but cannot see through trials or
// price changes, so the key is strongly preferred.

const PANEL_PRODUCT_ID = process.env.PANEL_PRODUCT_ID || 'prod_UzmqR1DZ9G7nNi';

/** Panel subscription price in cents, for the no-key fallback only. */
const PANEL_AMOUNT = 1499;

/**
 * Decide which entitlement a completed checkout grants.
 * productIds: line-item product ids when known, else null.
 * amountTotal: session.amount_total in cents.
 * Returns 'panel' or 'pro'.
 */
function classifyPurchase(productIds, amountTotal) {
  if (Array.isArray(productIds) && productIds.length > 0) {
    return productIds.includes(PANEL_PRODUCT_ID) ? 'panel' : 'pro';
  }
  return Number(amountTotal) === PANEL_AMOUNT ? 'panel' : 'pro';
}

/**
 * Fetch the product ids on a checkout session's line items. Returns null
 * when no API key is configured or the lookup fails, so callers fall back
 * to classifyPurchase's amount heuristic.
 */
async function fetchSessionProductIds(sessionId) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || !sessionId) return null;
  try {
    const res = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}/line_items?limit=10`,
      { headers: { authorization: `Bearer ${key}` } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const ids = (data?.data ?? [])
      .map((li) => li?.price?.product)
      .filter((p) => typeof p === 'string');
    return ids.length > 0 ? ids : null;
  } catch {
    return null;
  }
}

/** Whether a subscription object (webhook payload) is for Panel. */
function subscriptionIsPanel(subscription) {
  const items = subscription?.items?.data ?? [];
  return items.some((it) => it?.price?.product === PANEL_PRODUCT_ID);
}

module.exports = { PANEL_PRODUCT_ID, classifyPurchase, fetchSessionProductIds, subscriptionIsPanel };

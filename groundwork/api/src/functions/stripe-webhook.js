const { app } = require('@azure/functions');
const crypto = require('node:crypto');
const { tableClient } = require('../lib/common');

// Reject events whose signed timestamp is older than this, to blunt replay.
const TOLERANCE_SECONDS = 300;

/**
 * Verify Stripe's `Stripe-Signature` header without the Stripe SDK.
 * The signed payload is `${timestamp}.${rawBody}`; Stripe signs it with
 * HMAC-SHA256 using the endpoint's signing secret. Returns the parsed
 * event on success, or null if verification fails.
 */
function verifyStripeEvent(rawBody, sigHeader, secret) {
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

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > TOLERANCE_SECONDS) return null;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`, 'utf8')
    .digest('hex');

  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(signature, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    return JSON.parse(rawBody);
  } catch {
    return null;
  }
}

async function grantPro(userId, email, context) {
  const client = tableClient();
  await client.createTable().catch(() => {});
  await client.upsertEntity(
    {
      partitionKey: 'entitlement',
      rowKey: userId,
      pro: true,
      source: 'stripe',
      email: String(email || ''),
      updatedAt: new Date().toISOString(),
    },
    'Merge',
  );
  context.log(`Granted Pro to user ${userId}`);
}

app.http('stripe-webhook', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'stripe-webhook',
  handler: async (request, context) => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      context.error('STRIPE_WEBHOOK_SECRET is not set');
      // 200 so Stripe does not retry a misconfiguration forever; the log
      // surfaces the problem.
      return { status: 200, body: 'not configured' };
    }

    const rawBody = await request.text();
    const event = verifyStripeEvent(rawBody, request.headers.get('stripe-signature'), secret);
    if (!event) {
      return { status: 400, body: 'signature verification failed' };
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const userId = session.client_reference_id;
      const email = session.customer_details?.email || session.customer_email || '';
      if (userId) {
        try {
          await grantPro(userId, email, context);
        } catch (err) {
          context.error('Failed to grant Pro', err);
          // 500 so Stripe retries; the payment is real and we want the grant.
          return { status: 500, body: 'grant failed' };
        }
      } else {
        // Paid without a linked account (e.g. link opened without the ID).
        // Ack the event; the manual flow covers matching by email.
        context.warn(`checkout.session.completed with no client_reference_id (email ${email})`);
      }
    }

    return { status: 200, body: 'ok' };
  },
});

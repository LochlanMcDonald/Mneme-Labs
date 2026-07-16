# Groundwork Pro: how it works and how to operate it

Pro is the paid tier: a personalized, print-ready security report and
access to a human security advisor. This doc covers the moving parts and
the manual operations while the tier is in early access.

## What Pro members get

- **Security Readiness Report**: a branded, light-themed, print-optimized
  report generated from their plan (readiness score, coverage by area,
  full phased plan with statuses and notes). Members print or save it as
  PDF from the browser.
- **Ask a security advisor**: a request form in the app. Requests are
  stored per user, and the member is promised a reply to their sign-in
  email within one business day.

## How entitlements work

- The `groundworkstate` table has an `entitlement` partition. A user is
  Pro when a row exists with `partitionKey = "entitlement"`,
  `rowKey = <their SWA user id>`, and a boolean property `pro = true`.
- The client never writes this partition; `/api/state` writes only the
  `state` partition. `/api/me` reports the flag; `/api/assist` enforces it
  server-side.

### Granting Pro manually (early access)

1. Get the member's user id: it's the `rowKey` of their row in the
   `state` partition (their email is in the `userDetails` column), or ask
   them to send you the `userId` from `https://<app-domain>/api/me`.
2. Storage account → **Storage browser → Tables → groundworkstate** →
   **Add entity**: PartitionKey `entitlement`, RowKey `<user id>`, add a
   property `pro` of type **Boolean** set to `true`.
3. Done; the app picks it up on their next page load.

## Answering advisor requests

Answer questions in the app's **Admin** view (a button appears on the
dashboard for admins). It lists every request, open first; type a reply
and the user sees it threaded under their question in "Ask an advisor".

### Becoming an admin

1. Sign in to the app and open `https://<app-domain>/api/me` — copy your
   `userId`.
2. Add it to the `ADMIN_USER_IDS` app setting on the Static Web App
   (comma-separated for multiple admins).
3. Reload; the **Admin** button appears on your dashboard.

Requests still live in the `assist` partition of the table (subject,
message, `userDetails`, `status`, and now `answer`/`answeredAt`), so the
storage browser remains a fallback.

### Email notifications (optional)

With Azure Communication Services configured, you get an email when a
question arrives and the user gets one when you reply. All email is
best-effort: if unset, the app works exactly the same, just without the
alerts. Set these app settings on the Static Web App:

- `ACS_EMAIL_CONNECTION_STRING` — from an Azure Communication Services
  resource with Email enabled.
- `EMAIL_SENDER` — a verified sender address. Fastest start: the free
  Azure-managed domain (`DoNotReply@<something>.azurecomm.net`). For mail
  from `support@groundwork-security.com`, verify the domain in ACS first
  (the SPF/DKIM records).
- `ADMIN_NOTIFY_EMAIL` — where new-question alerts go
  (e.g. support@groundwork-security.com).

## Taking payment

The Stripe Payment Link for Pro is live: the "Upgrade to Pro" button is
baked into both the Azure and Netlify builds via `VITE_UPGRADE_URL`. To
swap the link without a code change, set an `UPGRADE_URL` repository
variable (GitHub → Settings → Secrets and variables → Actions →
Variables); the Azure workflow prefers it over the built-in default.

### Automatic activation (Stripe webhook)

Paid accounts unlock Pro automatically:

1. When a signed-in user clicks **Upgrade to Pro**, their Groundwork user
   id rides along as Stripe's `client_reference_id` in the checkout URL.
2. On payment, Stripe calls `POST /api/stripe-webhook`. The function
   verifies the Stripe signature, reads `client_reference_id`, and writes
   that user's `entitlement` row with `pro = true`. The user has Pro on
   their next page load, no manual step.

**One-time setup:**

1. Stripe Dashboard → Developers → Webhooks → **Add endpoint**.
2. Endpoint URL: `https://www.groundwork-security.com/api/stripe-webhook`.
3. Events to send: **`checkout.session.completed`**.
4. After creating it, copy the endpoint's **Signing secret** (`whsec_...`).
5. In the Static Web App → Environment variables, add
   `STRIPE_WEBHOOK_SECRET` = that value.
6. Use Stripe's **Send test webhook** (or a real $299 test purchase and
   refund) to confirm the entitlement row appears.

**Manual fallback:** if someone pays through a link that lost the
`client_reference_id` (rare), the webhook logs it and acks. Match them by
the email in the Stripe payment and grant Pro manually (see "Granting Pro
manually" above).

Set the Payment Link's **post-payment confirmation message** to reassure
buyers, e.g. "Thanks! Your Pro access is unlocking now, refresh Groundwork
in a moment."

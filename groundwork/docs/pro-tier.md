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

- Requests live in the `assist` partition of the same table: subject,
  message, `userDetails` (their email), `createdAt`, `status`.
- Check for `status = "open"` rows, reply from
  **support@groundwork-security.com** (the address promised in the app),
  then edit the row and set `status` to `answered` so the app shows it as
  handled.
- Consider a recurring reminder to check the table until there's
  notification automation.

## Taking payment

The Stripe Payment Link for Pro is live: the "Upgrade to Pro" button is
baked into both the Azure and Netlify builds via `VITE_UPGRADE_URL`. To
swap the link without a code change, set an `UPGRADE_URL` repository
variable (GitHub → Settings → Secrets and variables → Actions →
Variables); the Azure workflow prefers it over the built-in default.

### When a payment lands (manual activation)

There is no webhook yet, so activation is manual:

1. Stripe emails you (and shows the payment in the dashboard) with the
   buyer's email.
2. Find their row in the `state` partition by `userDetails` (their email)
   to get their user id.
3. Grant Pro by adding their `entitlement` row (see "Granting Pro
   manually" above). They get access on their next page load.

Because activation is not instant, set the Payment Link's **post-payment
confirmation message** in Stripe to set expectations, e.g. "Thanks! We're
activating your Pro access now and will confirm by email within one
business day." Watch for Stripe payment notifications so grants happen
promptly.

Automating this (a Stripe webhook function that verifies the event and
writes the entitlement row) is the natural next step once volume
justifies it.

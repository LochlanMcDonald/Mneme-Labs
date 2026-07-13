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
- Check for `status = "open"` rows, reply by email, then edit the row and
  set `status` to `answered` so the app shows it as handled.
- Consider a recurring reminder to check the table until there's
  notification automation.

## Taking payment

The upgrade button appears when the build has `VITE_UPGRADE_URL` set
(e.g. a Stripe Payment Link). Suggested early-access flow:

1. Create a Payment Link in Stripe (product "Groundwork Pro", yearly
   price).
2. Set `VITE_UPGRADE_URL` to that link for the Azure build (repository
   variable consumed by the deploy workflow) and in `netlify.toml` if the
   Netlify copy should show it too.
3. When a payment lands, Stripe emails you the buyer's email; find their
   user row by `userDetails` and grant Pro as above.

Automating step 3 (a Stripe webhook function that writes the entitlement
row) is the natural next step once volume justifies it.

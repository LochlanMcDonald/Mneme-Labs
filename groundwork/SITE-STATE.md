# Groundwork: site state snapshot

Recorded 2026-07-25, immediately before the visual redesign. This is the
reference for "what worked before," so any regression can be spotted and
reversed.

**Restore points:**

| State | Commit |
| --- | --- |
| Dark theme, before the first redesign | `4848da3` (merge of PR #26) |
| Light translucent theme, live before the second redesign | `beb2132` (merge of PR #27) |

```bash
git checkout -b restore <commit>
```

## Hosting

| Piece | Where |
| --- | --- |
| Account-enabled app | Azure Static Web Apps, groundwork-security.com |
| Marketing site + app copy | Netlify (`scripts/build-site.sh` publishes `_site`) |
| CI | GitHub Actions `test-and-build`, plus `azure-swa.yml` on push to main |

## Payments

- Stripe Payment Link: `https://buy.stripe.com/6oU28t0wH5ZE6Aya7Q2Nq02`
  (build-time value of `VITE_UPGRADE_URL`; this is public by design).
- Pro tier: 299 per year.
- Checkout carries `client_reference_id` = the signed-in user id and prefills
  the email, so the webhook can unlock the right account.
- `/api/stripe-webhook` verifies the Stripe signature with HMAC-SHA256 against
  `STRIPE_WEBHOOK_SECRET` (server-side only, never shipped to the browser).
  Covered by `api/test/verify-signature.test.mjs`.
- Route is deliberately anonymous in `staticwebapp.config.json`; every other
  `/api/*` route requires authentication.

## Accounts and saved plans

- Sign-in is Azure Static Web Apps built-in auth (Microsoft/Entra) at
  `/.auth/login/aad`, `/.auth/logout`, and `/.auth/me`.
- `/api/me` returns `{ userId, userDetails, pro, admin }`. Admin is granted by
  the `ADMIN_USER_IDS` app setting.
- `/api/state` reads and writes the plan for the signed-in user only.
- Storage: Azure Table Storage, table `groundworkstate`, connection string in
  the `STORAGE_CONNECTION_STRING` app setting.
- The plan also lives in the browser's localStorage so anonymous visitors keep
  their work.

### Account isolation rules (do not regress)

`src/state/sync.ts` decides what happens when a signed-in user loads:

- `use-server` when the account already has a saved plan.
- `push-local` only when the local plan is unowned (`ownerId` null) or owned by
  the same user.
- `reset` otherwise, so one account can never inherit another account's plan.

`src/state/store.ts` stamps `ownerId` on save and clears a foreign plan on
sign-in. This fixed a real leak; keep the 6 tests in `sync.test.ts` green.

## Advisor requests

- `/api/assist` GET lists the signed-in user's requests, POST creates one.
- `/api/assist?scope=admin` is the admin view (list all, post an answer),
  gated by `isAdmin`.
- Important deployment lesson: brand new standalone Azure function files have
  silently 404'd on this Static Web App. Admin was folded into the existing
  `assist` function for that reason. Add new server logic to an existing
  function rather than creating a new file.

## Views and routes

Single page app, view state in React. Hash-linkable views only:
`#/terms`, `#/privacy`, `#/help`. Other views (landing, wizard, dashboard,
report, advisor, admin) are internal state.

## What must keep working

1. Anonymous visitor can complete the wizard and get a plan.
2. Plan persists in localStorage across reloads.
3. Sign-in saves the plan to the account and restores it on another device.
4. A second account never sees the first account's plan.
5. Item status changes and notes save and survive reload.
6. Report renders, prints cleanly, and exports.
7. Advisor request submits and appears in the list.
8. Upgrade button opens the Stripe link with the user id attached.
9. Terms, Privacy, and Help open and link correctly.
10. `npm run build` and `npm test` (20 tests + the signature test) pass.

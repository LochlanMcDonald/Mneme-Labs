# Azure setup for Groundwork accounts

Groundwork's account features (Microsoft sign-in, plans saved per user) run
on Azure Static Web Apps with the managed Functions API in `groundwork/api/`
and Azure Table Storage for the data. Everything in the repo is ready; the
one-time Azure setup takes about ten minutes.

## What you create

1. **A Static Web App** (Free tier is fine)
   - Portal: Create resource → Static Web App.
   - Deployment source: choose **Other** (the repo already has a GitHub
     Actions workflow; letting Azure add its own would create a duplicate).
   - After creation, copy the **deployment token** (Overview → Manage
     deployment token).

2. **A Storage account** (Standard, LRS is fine)
   - Portal: Create resource → Storage account.
   - Copy a **connection string** (Security + networking → Access keys).
   - The API creates the `groundworkstate` table on first use; no manual
     table setup needed.

## What you configure

3. **GitHub secret**: in the repo, Settings → Secrets and variables →
   Actions → New repository secret:
   - Name: `AZURE_STATIC_WEB_APPS_API_TOKEN`
   - Value: the deployment token from step 1.

4. **SWA app setting**: in the Static Web App, Settings → Environment
   variables (or Configuration → Application settings):
   - Name: `STORAGE_CONNECTION_STRING`
   - Value: the connection string from step 2.

5. Run the **"Deploy to Azure Static Web Apps"** workflow (it also runs on
   every push to `main` that touches the site; until the secret exists
   the deploy job simply skips).

## Site layout on Azure

The Static Web App serves the Groundwork app at its root, with the
managed API at `/api` and sign-in on the same origin. It is the home of
**groundwork-security.com** (Settings → Custom domains): `www` points at
the SWA via CNAME, and the apex domain forwards to `www` at the
registrar. The Mneme Labs root site stays on Netlify, where the
`/groundwork/` copy runs local-only and hands sign-in off to the domain
via `VITE_ACCOUNT_URL` in `netlify.toml`.

## How it behaves

- Sign-in uses the Static Web Apps built-in Microsoft (Entra ID) provider
  at `/.auth/login/aad`; no app registration is required for the default
  setup. To restrict sign-in to one tenant or add other providers, use a
  [custom registration](https://learn.microsoft.com/azure/static-web-apps/authentication-custom).
- `/api/state` is restricted to authenticated users in
  `staticwebapp.config.json`, and the function separately validates the
  SWA-injected principal header before touching storage.
- Each user's plan is one row in the `groundworkstate` table, keyed by the
  SWA user id. Saves are last-write-wins.
- On hosts without SWA auth (the Netlify site, deploy previews, local
  `vite dev`), the app detects that `/.auth/me` is missing and runs in
  local-only localStorage mode. When `VITE_ACCOUNT_URL` is set at build
  time (see `netlify.toml`), those hosts still show a "Sign in with
  Microsoft" button that hands users off to the account-enabled Azure
  deployment; when unset, they show no sign-in UI at all.

## Local development with accounts

The [SWA CLI](https://azure.github.io/static-web-apps-cli/) emulates auth
and the API locally:

```bash
npm install -g @azure/static-web-apps-cli
cd groundwork && npm install && (cd api && npm install)
swa start http://localhost:5173 --run "npm run dev" --api-location api
```

Set `STORAGE_CONNECTION_STRING` in your shell (a real storage account or
[Azurite](https://learn.microsoft.com/azure/storage/common/storage-use-azurite)
with `UseDevelopmentStorage=true`) before starting, then open the SWA CLI
URL (default http://localhost:4280) and use its fake sign-in screen.

# Groundwork Panel

Every security console, one glance. A downloadable dashboard that shows new
alert counts from each of your security vendors and links straight into
their consoles. Your API keys stay in a config file on your machine; the
panel talks only to the vendors' own APIs and never to Groundwork servers.

## Run it

```
npm install
npm run build
npm start        # http://localhost:7439
```

With no consoles configured the board shows demo data so you can see the
layout. Click "Add a console" to go live.

## How it works

- `server.mjs` is the local runtime: it serves the built dashboard and does
  the vendor polling (vendor APIs do not allow cross-origin browser calls).
- Credentials live in `~/.groundwork-panel/config.json`, chmod 600. They are
  sent only to the vendor's own API, and the config endpoint strips them
  before anything reaches the browser.
- Connectors live in `connectors/`, one module per vendor exporting
  `poll(creds) -> { total, severities }`. Each connector owns its vendor's
  whole auth flow internally; the board never knows the difference. All
  six are implemented: GitHub (static token), CrowdStrike Falcon (OAuth2
  client-credentials, cached bearer, regional clouds), Microsoft Defender
  (Entra client-credentials into the Graph security API), Microsoft
  Sentinel (Entra client-credentials scoped to Azure Resource Manager,
  reading workspace incidents with nextLink paging; the app needs the
  Sentinel Reader role), Proofpoint TRAP (static API key against the
  appliance's incidents API) and Google Workspace (service-account JWT
  signed locally, exchanged for a bearer, domain-wide delegation).
- `npm test` runs the connector suite: every vendor API is imitated by a
  local mock that enforces that vendor's real auth mechanics (the Google
  mock verifies the RS256 JWT signature), and every connector is asserted
  on counts, token caching and plain-language credential errors.

## Status

Prototype. Not linked from the site and not part of any deploy.

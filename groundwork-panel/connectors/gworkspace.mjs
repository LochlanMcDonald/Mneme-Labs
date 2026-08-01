// Google Workspace alert center connector. The ugliest auth of the set:
// a service account JWT is built and signed locally (RS256 over the key
// in the service account JSON), exchanged at Google's token endpoint for
// a bearer token, and that token queries the alert center. Needs a
// service account with domain-wide delegation for the
// https://www.googleapis.com/auth/apps.alerts scope, impersonating an
// admin.

import { createSign } from 'node:crypto';

const SCOPE = 'https://www.googleapis.com/auth/apps.alerts';
const TOKEN_SLACK_MS = 60_000;

const tokenCache = new Map();

function b64url(data) {
  return Buffer.from(data).toString('base64url');
}

function signedJwt(sa, delegatedAdmin) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      sub: delegatedAdmin,
      scope: SCOPE,
      aud: sa.token_uri,
      iat: now,
      exp: now + 3600,
    }),
  );
  const input = `${header}.${claims}`;
  const signature = createSign('RSA-SHA256').update(input).sign(sa.private_key, 'base64url');
  return `${input}.${signature}`;
}

async function bearerToken(sa, delegatedAdmin) {
  const cacheKey = `${sa.client_email}|${delegatedAdmin}|${sa.token_uri}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt - TOKEN_SLACK_MS > Date.now()) {
    return cached.token;
  }
  const res = await fetch(sa.token_uri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: signedJwt(sa, delegatedAdmin),
    }),
  });
  if (!res.ok) {
    throw new Error(
      res.status === 400 || res.status === 401
        ? 'Google rejected the service account credentials or delegation'
        : `Google token endpoint returned ${res.status}`,
    );
  }
  const data = await res.json();
  if (!data.access_token) throw new Error('Google returned no access token');
  tokenCache.set(cacheKey, {
    token: data.access_token,
    expiresAt: Date.now() + (Number(data.expires_in) || 3599) * 1000,
  });
  return data.access_token;
}

export async function poll(creds) {
  let sa;
  try {
    sa = JSON.parse(String(creds.serviceAccountJson || ''));
  } catch {
    throw new Error('The service account JSON could not be parsed');
  }
  const delegatedAdmin = String(creds.delegatedAdmin || '').trim();
  if (!sa?.client_email || !sa?.private_key || !sa?.token_uri || !delegatedAdmin) {
    throw new Error('Google Workspace needs the service account JSON and a delegated admin email');
  }
  // Overridable for tests.
  const apiUrl = String(creds.apiUrl || 'https://alertcenter.googleapis.com').replace(/\/+$/, '');

  const token = await bearerToken(sa, delegatedAdmin);

  const res = await fetch(`${apiUrl}/v1beta1/alerts?pageSize=200`, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
  });
  if (res.status === 403) {
    throw new Error('The service account is missing alert center access (apps.alerts scope with domain-wide delegation)');
  }
  if (!res.ok) throw new Error(`Alert center returned ${res.status}`);
  const data = await res.json();
  const alerts = Array.isArray(data.alerts) ? data.alerts : [];

  // Alert center reports severity inconsistently; use it when present and
  // fall back to low. Counts cap at one page (200), plenty for a tile.
  const severities = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const a of alerts) {
    const s = String(a?.metadata?.severity || '').toUpperCase();
    if (s === 'HIGH') severities.high += 1;
    else if (s === 'MEDIUM') severities.medium += 1;
    else severities.low += 1;
  }

  return { total: alerts.length, severities };
}

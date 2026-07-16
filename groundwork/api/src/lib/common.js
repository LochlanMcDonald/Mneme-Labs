const { TableClient } = require('@azure/data-tables');

const TABLE_NAME = 'groundworkstate';

/**
 * All Groundwork data lives in one table, separated by partition:
 *  - 'state'        one row per user: their plan document
 *  - 'entitlement'  one row per user: pro flag (written manually or by
 *                   payment tooling, never by the client API)
 *  - 'assist'       advisor requests, many rows per user
 */
function tableClient() {
  const conn = process.env.STORAGE_CONNECTION_STRING;
  if (!conn) {
    throw new Error(
      'STORAGE_CONNECTION_STRING is not set. Add it in the Static Web App configuration (see groundwork/docs/azure-setup.md).',
    );
  }
  return TableClient.fromConnectionString(conn, TABLE_NAME);
}

/**
 * Static Web Apps forwards the authenticated user as a base64-encoded JSON
 * principal. Routes are additionally locked to the "authenticated" role in
 * staticwebapp.config.json; this is defense in depth.
 */
function principalFrom(request) {
  const header = request.headers.get('x-ms-client-principal');
  if (!header) return null;
  try {
    const parsed = JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
    return parsed && typeof parsed.userId === 'string' && parsed.userId.length > 0
      ? parsed
      : null;
  } catch {
    return null;
  }
}

/** Whether the given user has the Pro entitlement. */
async function isPro(client, userId) {
  try {
    const entity = await client.getEntity('entitlement', userId);
    return entity.pro === true;
  } catch (err) {
    if (err && err.statusCode === 404) return false;
    throw err;
  }
}

/**
 * Whether a user id is a Groundwork admin. Admins are listed in the
 * ADMIN_USER_IDS app setting (comma-separated SWA user ids). Find your own
 * id at /api/me while signed in.
 */
function isAdmin(userId) {
  const ids = String(process.env.ADMIN_USER_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.includes(userId);
}

module.exports = { tableClient, principalFrom, isPro, isAdmin };

const { app } = require('@azure/functions');
const { TableClient } = require('@azure/data-tables');

const TABLE_NAME = 'groundworkstate';
const PARTITION = 'state';
// Generous ceiling for one plan document; real payloads are a few KB.
const MAX_BODY_BYTES = 200_000;

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

app.http('state', {
  methods: ['GET', 'PUT'],
  authLevel: 'anonymous',
  route: 'state',
  handler: async (request, context) => {
    const principal = principalFrom(request);
    if (!principal) {
      return { status: 401, jsonBody: { error: 'Not signed in' } };
    }

    const client = tableClient();
    await client.createTable().catch(() => {
      // Table already exists; any real connectivity problem will surface
      // on the read/write below.
    });

    if (request.method === 'GET') {
      try {
        const entity = await client.getEntity(PARTITION, principal.userId);
        return { jsonBody: { state: JSON.parse(entity.payload) } };
      } catch (err) {
        if (err && err.statusCode === 404) {
          return { jsonBody: { state: null } };
        }
        context.error('Failed to read state', err);
        return { status: 500, jsonBody: { error: 'Failed to read saved plan' } };
      }
    }

    const text = await request.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) {
      return { status: 413, jsonBody: { error: 'State too large' } };
    }
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      return { status: 400, jsonBody: { error: 'Invalid JSON' } };
    }
    if (!body || typeof body !== 'object' || typeof body.state !== 'object' || body.state === null) {
      return { status: 400, jsonBody: { error: 'Missing state object' } };
    }

    try {
      await client.upsertEntity(
        {
          partitionKey: PARTITION,
          rowKey: principal.userId,
          payload: JSON.stringify(body.state),
          userDetails: String(principal.userDetails || ''),
          updatedAt: new Date().toISOString(),
        },
        'Replace',
      );
    } catch (err) {
      context.error('Failed to write state', err);
      return { status: 500, jsonBody: { error: 'Failed to save plan' } };
    }
    return { status: 204 };
  },
});

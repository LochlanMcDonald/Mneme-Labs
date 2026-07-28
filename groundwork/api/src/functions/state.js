const { app } = require('@azure/functions');
const { tableClient, principalFrom } = require('../lib/common');

const PARTITION = 'state';
// Generous ceiling for one plan document; real payloads are a few KB.
const MAX_BODY_BYTES = 200_000;

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

    // First write stamps createdAt; later saves preserve it, so the admin
    // page can show when each account first appeared. A failed read must
    // not block the save, so it falls back to "now".
    const updatedAt = new Date().toISOString();
    let createdAt = updatedAt;
    try {
      const existing = await client.getEntity(PARTITION, principal.userId);
      if (typeof existing.createdAt === 'string' && existing.createdAt) {
        createdAt = existing.createdAt;
      }
    } catch {
      // 404 (new user) or transient read failure: keep createdAt = now.
    }

    try {
      await client.upsertEntity(
        {
          partitionKey: PARTITION,
          rowKey: principal.userId,
          payload: JSON.stringify(body.state),
          userDetails: String(principal.userDetails || ''),
          createdAt,
          updatedAt,
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

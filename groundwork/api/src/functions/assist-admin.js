const { app } = require('@azure/functions');
const { tableClient, principalFrom, isAdmin } = require('../lib/common');
const { sendEmail } = require('../lib/notify');

const MAX_ANSWER = 8000;

/**
 * Admin view of advisor requests. GET lists every request across users;
 * POST attaches an answer to one and marks it answered, optionally
 * emailing the user that a reply is waiting. Restricted to admins
 * (ADMIN_USER_IDS app setting) on top of the SWA authenticated gate.
 */
app.http('assist-admin', {
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  route: 'admin/assist',
  handler: async (request, context) => {
    const principal = principalFrom(request);
    if (!principal) {
      return { status: 401, jsonBody: { error: 'Not signed in' } };
    }
    if (!isAdmin(principal.userId)) {
      return { status: 403, jsonBody: { error: 'Not authorized' } };
    }

    const client = tableClient();
    await client.createTable().catch(() => {});

    if (request.method === 'GET') {
      const requests = [];
      const iter = client.listEntities({
        queryOptions: { filter: `PartitionKey eq 'assist'` },
      });
      try {
        for await (const e of iter) {
          requests.push({
            id: e.rowKey,
            userId: e.userId,
            userDetails: e.userDetails,
            subject: e.subject,
            message: e.message,
            status: e.status,
            createdAt: e.createdAt,
            answer: e.answer || '',
            answeredAt: e.answeredAt || '',
          });
        }
      } catch (err) {
        context.error('Failed to list requests', err);
        return { status: 500, jsonBody: { error: 'Failed to load requests' } };
      }
      requests.sort((a, b) => {
        // Open first, then newest.
        if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
        return String(b.createdAt).localeCompare(String(a.createdAt));
      });
      return { jsonBody: { requests } };
    }

    // POST: answer a request.
    let body;
    try {
      body = await request.json();
    } catch {
      return { status: 400, jsonBody: { error: 'Invalid JSON' } };
    }
    const id = String(body?.id ?? '').trim();
    const answer = String(body?.answer ?? '').trim();
    if (!id || !answer) {
      return { status: 400, jsonBody: { error: 'id and answer are required' } };
    }
    if (answer.length > MAX_ANSWER) {
      return { status: 413, jsonBody: { error: 'Answer too long' } };
    }

    let entity;
    try {
      entity = await client.getEntity('assist', id);
    } catch (err) {
      if (err && err.statusCode === 404) {
        return { status: 404, jsonBody: { error: 'Request not found' } };
      }
      context.error('Failed to read request', err);
      return { status: 500, jsonBody: { error: 'Failed to read request' } };
    }

    const answeredAt = new Date().toISOString();
    try {
      await client.updateEntity(
        { partitionKey: 'assist', rowKey: id, answer, answeredAt, status: 'answered' },
        'Merge',
      );
    } catch (err) {
      context.error('Failed to save answer', err);
      return { status: 500, jsonBody: { error: 'Failed to save answer' } };
    }

    // Best-effort: let the user know a reply is waiting in the app.
    if (entity.userDetails) {
      sendEmail(
        {
          to: entity.userDetails,
          subject: `Your Groundwork advisor replied: ${entity.subject}`,
          text: `We've answered your question "${entity.subject}". Open Groundwork and go to Ask an advisor to read the reply.`,
        },
        context,
      ).catch(() => {});
    }

    return { status: 200, jsonBody: { ok: true, answeredAt } };
  },
});

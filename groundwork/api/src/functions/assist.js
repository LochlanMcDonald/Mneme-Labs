const { app } = require('@azure/functions');
const { tableClient, principalFrom, isPro, isAdmin } = require('../lib/common');

const MAX_SUBJECT = 200;
const MAX_MESSAGE = 4000;
const MAX_ANSWER = 8000;
// Cap stored requests per user so the endpoint cannot be used as a dump.
const MAX_REQUESTS_PER_USER = 50;

// Admin operations live here (behind ?scope=admin) rather than in a separate
// function: Azure Static Web Apps serves this already-registered endpoint
// reliably, and a distinct admin function was not being served.
async function handleAdmin(request, context, client, principal) {
  if (!isAdmin(principal.userId)) {
    return { status: 403, jsonBody: { error: 'Not authorized' } };
  }

  if (request.method === 'GET') {
    const requests = [];
    const iter = client.listEntities({ queryOptions: { filter: `PartitionKey eq 'assist'` } });
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

  return { status: 200, jsonBody: { ok: true, answeredAt } };
}

app.http('assist', {
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  route: 'assist',
  handler: async (request, context) => {
    const principal = principalFrom(request);
    if (!principal) {
      return { status: 401, jsonBody: { error: 'Not signed in' } };
    }

    const client = tableClient();
    await client.createTable().catch(() => {});

    // Admin path is gated by admin membership, not Pro.
    const scope = new URL(request.url).searchParams.get('scope');
    if (scope === 'admin') {
      return handleAdmin(request, context, client, principal);
    }

    const pro = await isPro(client, principal.userId).catch((err) => {
      context.error('Failed to read entitlement', err);
      return null;
    });
    if (pro === null) {
      return { status: 500, jsonBody: { error: 'Failed to load account' } };
    }
    if (!pro) {
      return { status: 403, jsonBody: { error: 'Advisor access is part of Groundwork Pro' } };
    }

    if (request.method === 'GET') {
      const requests = [];
      const iter = client.listEntities({
        queryOptions: {
          filter: `PartitionKey eq 'assist' and userId eq '${principal.userId.replace(/'/g, "''")}'`,
        },
      });
      try {
        for await (const entity of iter) {
          requests.push({
            id: entity.rowKey,
            subject: entity.subject,
            message: entity.message,
            status: entity.status,
            createdAt: entity.createdAt,
            answer: entity.answer || '',
            answeredAt: entity.answeredAt || '',
          });
        }
      } catch (err) {
        context.error('Failed to list assist requests', err);
        return { status: 500, jsonBody: { error: 'Failed to load requests' } };
      }
      requests.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      return { jsonBody: { requests } };
    }

    // POST: create a request.
    let body;
    try {
      body = await request.json();
    } catch {
      return { status: 400, jsonBody: { error: 'Invalid JSON' } };
    }
    const subject = String(body?.subject ?? '').trim();
    const message = String(body?.message ?? '').trim();
    if (!subject || !message) {
      return { status: 400, jsonBody: { error: 'Subject and message are required' } };
    }
    if (subject.length > MAX_SUBJECT || message.length > MAX_MESSAGE) {
      return { status: 413, jsonBody: { error: 'Request too long' } };
    }

    let count = 0;
    const countIter = client.listEntities({
      queryOptions: {
        filter: `PartitionKey eq 'assist' and userId eq '${principal.userId.replace(/'/g, "''")}'`,
        select: ['rowKey'],
      },
    });
    for await (const _ of countIter) {
      count += 1;
      if (count >= MAX_REQUESTS_PER_USER) {
        return { status: 429, jsonBody: { error: 'Request limit reached' } };
      }
    }

    const createdAt = new Date().toISOString();
    const rowKey = `${createdAt}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      await client.createEntity({
        partitionKey: 'assist',
        rowKey,
        userId: principal.userId,
        userDetails: String(principal.userDetails || ''),
        subject,
        message,
        status: 'open',
        createdAt,
      });
    } catch (err) {
      context.error('Failed to store assist request', err);
      return { status: 500, jsonBody: { error: 'Failed to submit request' } };
    }

    return {
      status: 201,
      jsonBody: {
        request: { id: rowKey, subject, message, status: 'open', createdAt, answer: '', answeredAt: '' },
      },
    };
  },
});

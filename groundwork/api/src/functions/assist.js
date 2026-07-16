const { app } = require('@azure/functions');
const { tableClient, principalFrom, isPro } = require('../lib/common');
const { sendEmail, ADMIN_NOTIFY_EMAIL } = require('../lib/notify');

const MAX_SUBJECT = 200;
const MAX_MESSAGE = 4000;
// Cap stored requests per user so the endpoint cannot be used as a dump.
const MAX_REQUESTS_PER_USER = 50;

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

    // Best-effort: alert the team that a question came in. Never blocks or
    // fails the user's submission.
    const adminEmail = ADMIN_NOTIFY_EMAIL();
    if (adminEmail) {
      sendEmail(
        {
          to: adminEmail,
          subject: `New Groundwork advisor question: ${subject}`,
          text: `From: ${principal.userDetails || principal.userId}\n\nSubject: ${subject}\n\n${message}\n\nReply in the Groundwork admin view.`,
        },
        context,
      ).catch(() => {});
    }

    return {
      status: 201,
      jsonBody: {
        request: { id: rowKey, subject, message, status: 'open', createdAt, answer: '', answeredAt: '' },
      },
    };
  },
});

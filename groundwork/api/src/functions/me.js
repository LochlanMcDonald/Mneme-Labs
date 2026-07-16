const { app } = require('@azure/functions');
const { tableClient, principalFrom, isPro, isAdmin } = require('../lib/common');

app.http('me', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'me',
  handler: async (request, context) => {
    const principal = principalFrom(request);
    if (!principal) {
      return { status: 401, jsonBody: { error: 'Not signed in' } };
    }
    try {
      const client = tableClient();
      await client.createTable().catch(() => {});
      const pro = await isPro(client, principal.userId);
      return {
        jsonBody: {
          userId: principal.userId,
          userDetails: String(principal.userDetails || ''),
          pro,
          admin: isAdmin(principal.userId),
        },
      };
    } catch (err) {
      context.error('Failed to read entitlement', err);
      return { status: 500, jsonBody: { error: 'Failed to load account' } };
    }
  },
});

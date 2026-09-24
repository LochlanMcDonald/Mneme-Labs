const { app } = require('@azure/functions');
const { tableClient, principalFrom, isAdmin } = require('../lib/common');

// AeroCall download counter. Every click on the site's "Download .py" or
// "View source" link comes through here: we log one row, bump a running
// total, then hand the visitor the file. Admins read the tally back with
// ?stats=1. This counts intentional clicks, not raw fetches — the file is
// still a public static asset, so a counter is best-effort by design.
//
// Storage lives in the existing groundworkstate table:
//   partition 'download'  one row per click (newest first by row key)
//   partition 'meta'      a single 'aerocall' row holding the totals

const FILE_PATH = '/aerocall.py';
// Row keys sort ascending, so store an inverted timestamp to read newest
// first with a plain top-N query. Comfortably past the year 2200.
const KEY_CEILING = 10_000_000_000_000;

function clientIp(request) {
  // Trust the last x-forwarded-for hop (the one the platform appended), not
  // the first, which a caller can prepend.
  const xff = request.headers.get('x-forwarded-for');
  return xff ? xff.split(',').pop().trim() : 'unknown';
}

function isPrefetch(request) {
  const purpose =
    request.headers.get('sec-purpose') || request.headers.get('purpose') || '';
  return /prefetch|preview/i.test(purpose);
}

/** Same-origin base for fetching the static file, robust across SWA hosts. */
function siteBase(request) {
  if (process.env.SITE_ORIGIN) return process.env.SITE_ORIGIN.replace(/\/$/, '');
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  return host ? `${proto}://${host}` : new URL(request.url).origin;
}

/** Bump the running totals with a small optimistic-concurrency retry. */
async function bumpCounter(client, mode) {
  const field = mode === 'view' ? 'views' : 'downloads';
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const row = await client.getEntity('meta', 'aerocall');
      const next = Number(row[field] || 0) + 1;
      await client.updateEntity(
        { partitionKey: 'meta', rowKey: 'aerocall', [field]: next },
        'Merge',
        { etag: row.etag },
      );
      return;
    } catch (err) {
      if (err && err.statusCode === 404) {
        try {
          await client.createEntity({
            partitionKey: 'meta',
            rowKey: 'aerocall',
            downloads: mode === 'view' ? 0 : 1,
            views: mode === 'view' ? 1 : 0,
          });
          return;
        } catch (e) {
          if (e && e.statusCode === 409) continue; // someone else created it; retry the merge
          throw e;
        }
      }
      if (err && err.statusCode === 412) continue; // etag moved; retry
      throw err;
    }
  }
}

async function logClick(client, request, mode, principal) {
  const now = Date.now();
  const rowKey = `${KEY_CEILING - now}-${Math.random().toString(36).slice(2, 8)}`;
  await client.createEntity({
    partitionKey: 'download',
    rowKey,
    ts: new Date(now).toISOString(),
    ip: clientIp(request),
    ua: (request.headers.get('user-agent') || '').slice(0, 400),
    ref: (request.headers.get('referer') || '').slice(0, 400),
    mode: mode === 'view' ? 'view' : 'download',
    userId: principal ? principal.userId : '',
    userDetails: principal && principal.userDetails ? String(principal.userDetails) : '',
  });
  await bumpCounter(client, mode);
}

async function readStats(client) {
  let downloads = 0;
  let views = 0;
  try {
    const row = await client.getEntity('meta', 'aerocall');
    downloads = Number(row.downloads || 0);
    views = Number(row.views || 0);
  } catch (err) {
    if (!(err && err.statusCode === 404)) throw err;
  }

  const recent = [];
  const iter = client
    .listEntities({ queryOptions: { filter: `PartitionKey eq 'download'` } })
    .byPage({ maxPageSize: 50 });
  const first = await iter.next();
  if (!first.done) {
    for (const e of first.value) {
      recent.push({
        ts: e.ts || '',
        ip: e.ip || '',
        ua: e.ua || '',
        ref: e.ref || '',
        mode: e.mode || 'download',
        user: e.userDetails || e.userId || '',
      });
    }
  }
  return { downloads, views, total: downloads + views, recent };
}

/** Stream the file back as an attachment, or redirect if that fails. */
async function serveFile(request, mode) {
  const target = `${siteBase(request)}${FILE_PATH}`;
  if (mode === 'view') {
    return { status: 302, headers: { Location: FILE_PATH } };
  }
  try {
    const res = await fetch(target);
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    const body = Buffer.from(await res.arrayBuffer());
    return {
      status: 200,
      headers: {
        'Content-Type': 'text/x-python; charset=utf-8',
        'Content-Disposition': 'attachment; filename="aerocall.py"',
        'Cache-Control': 'no-store',
      },
      body,
    };
  } catch {
    // Fall back to a redirect; the browser still gets the file.
    return { status: 302, headers: { Location: FILE_PATH } };
  }
}

app.http('aerocall', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'aerocall',
  handler: async (request, context) => {
    const params = new URL(request.url).searchParams;
    const principal = principalFrom(request);

    // Admin-only tally.
    if (params.has('stats')) {
      if (!principal || !isAdmin(principal.userId)) {
        return { status: 403, jsonBody: { error: 'Admins only.' } };
      }
      try {
        return { jsonBody: await readStats(tableClient()) };
      } catch (err) {
        context.error('aerocall stats failed', err);
        return { status: 500, jsonBody: { error: 'Could not read download stats.' } };
      }
    }

    const mode = params.get('m') === 'view' ? 'view' : 'download';

    // Record the click (best-effort — never let logging block the file, and
    // don't count link prefetches).
    if (!isPrefetch(request)) {
      try {
        await logClick(tableClient(), request, mode, principal);
      } catch (err) {
        context.error('aerocall log failed', err);
      }
    }

    return serveFile(request, mode);
  },
});

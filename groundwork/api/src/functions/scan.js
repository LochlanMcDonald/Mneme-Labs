const { app } = require('@azure/functions');
const {
  normalizeDomain,
  txtState,
  mxState,
  allFailed,
  domainNotFound,
  findSpf,
  findDmarc,
  analyze,
} = require('../lib/scan');

// Public exposure check. Reads only public DNS through a DoH resolver and
// never contacts the target's own servers, so there is no scanning and no
// SSRF surface: the only outbound call is to a fixed resolver we control
// the query for. No sign-in required (this is the top of the funnel).

const DOH = 'https://dns.google/resolve';
const QUERY_TIMEOUT_MS = 4000;

// Small in-memory rate limit per instance, so the endpoint cannot be used
// as a bulk DNS oracle. It is a speed bump, not a wall (instances are
// short-lived and the header can be shaped), which is fine for a read-only
// public-DNS lookup.
const hits = new Map();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
let lastSweep = 0;

function sweep(now) {
  if (now - lastSweep < WINDOW_MS) return;
  lastSweep = now;
  for (const [key, arr] of hits) {
    if (arr.every((t) => now - t >= WINDOW_MS)) hits.delete(key);
  }
}

function rateLimited(ip, now) {
  sweep(now);
  const arr = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > MAX_PER_WINDOW;
}

/**
 * One DoH query. Returns { status, records } on any resolver answer (even
 * NXDOMAIN), or null when the call itself failed (network, non-2xx, or the
 * timeout fired). Distinguishing these is what stops a blip from reading as
 * exposure downstream.
 */
async function query(name, type) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), QUERY_TIMEOUT_MS);
  try {
    const res = await fetch(`${DOH}?name=${encodeURIComponent(name)}&type=${type}`, {
      headers: { accept: 'application/dns-json' },
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      status: typeof data.Status === 'number' ? data.Status : 0,
      records: (data.Answer || []).map((a) => String(a.data || '')).filter(Boolean),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

app.http('scan', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'scan',
  handler: async (request, context) => {
    // Trust the last x-forwarded-for hop (the one the platform appended),
    // not the first, which a caller can prepend.
    const xff = request.headers.get('x-forwarded-for');
    const ip = xff ? xff.split(',').pop().trim() : 'unknown';
    if (rateLimited(ip || 'unknown', Date.now())) {
      return { status: 429, jsonBody: { error: 'Too many checks. Try again in a minute.' } };
    }

    const domain = normalizeDomain(new URL(request.url).searchParams.get('domain'));
    if (!domain) {
      return { status: 400, jsonBody: { error: 'Enter a domain, like acme.com' } };
    }

    const [txt, dmarc, mx] = await Promise.all([
      query(domain, 'TXT'),
      query(`_dmarc.${domain}`, 'TXT'),
      query(domain, 'MX'),
    ]);

    if (allFailed(txt, dmarc, mx)) {
      return {
        status: 502,
        jsonBody: { error: 'Could not read DNS for that domain right now. Try again in a moment.' },
      };
    }
    if (domainNotFound(txt, mx)) {
      return {
        status: 404,
        jsonBody: { error: 'We could not find that domain. Check the spelling and try again.' },
      };
    }

    return {
      jsonBody: analyze(domain, {
        spf: txtState(txt, findSpf),
        dmarc: txtState(dmarc, findDmarc),
        mx: mxState(mx),
      }),
    };
  },
});

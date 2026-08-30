const { app } = require('@azure/functions');
const { normalizeDomain, analyze } = require('../lib/scan');

// Public exposure check. Reads only public DNS through a DoH resolver and
// never contacts the target's own servers, so there is no scanning and no
// SSRF surface: the only outbound call is to a fixed resolver we control
// the query for. No sign-in required (this is the top of the funnel).

const DOH = 'https://dns.google/resolve';

// Small in-memory rate limit per instance, so the endpoint cannot be used
// as a bulk DNS oracle. Not perfect across instances; it is a speed bump.
const hits = new Map();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;

function rateLimited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > MAX_PER_WINDOW;
}

async function resolveTxt(name) {
  try {
    const res = await fetch(`${DOH}?name=${encodeURIComponent(name)}&type=TXT`, {
      headers: { accept: 'application/dns-json' },
    });
    if (!res.ok) return [];
    const data = await res.json();
    // TXT data arrives JSON-quoted and may be split into chunks; join them.
    return (data.Answer || [])
      .map((a) => String(a.data || '').replace(/^"|"$/g, '').replace(/" "/g, ''))
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function resolveMx(name) {
  try {
    const res = await fetch(`${DOH}?name=${encodeURIComponent(name)}&type=MX`, {
      headers: { accept: 'application/dns-json' },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.Answer || []).map((a) => String(a.data || '')).filter(Boolean);
  } catch {
    return [];
  }
}

app.http('scan', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'scan',
  handler: async (request, context) => {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (rateLimited(ip)) {
      return { status: 429, jsonBody: { error: 'Too many checks. Try again in a minute.' } };
    }

    const domain = normalizeDomain(new URL(request.url).searchParams.get('domain'));
    if (!domain) {
      return { status: 400, jsonBody: { error: 'Enter a domain, like acme.com' } };
    }

    try {
      const [domainTxt, dmarcTxt, mx] = await Promise.all([
        resolveTxt(domain),
        resolveTxt(`_dmarc.${domain}`),
        resolveMx(domain),
      ]);
      return { jsonBody: analyze(domain, { domainTxt, dmarcTxt, mx }) };
    } catch (err) {
      context.error('scan failed', err);
      return { status: 502, jsonBody: { error: 'Could not read DNS for that domain right now.' } };
    }
  },
});

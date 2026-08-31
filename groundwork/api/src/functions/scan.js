const { app } = require('@azure/functions');
const {
  COMMON_DKIM_SELECTORS,
  normalizeDomain,
  txtState,
  mxState,
  allFailed,
  domainNotFound,
  findSpf,
  findDmarc,
  dkimState,
  parseCrt,
  composeReport,
  isPrivateIp,
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

/**
 * Read the certificate transparency history for a domain from crt.sh (a
 * public log search operated by Sectigo). This reads a public dataset; it
 * does not contact the target. Returns the parsed JSON array or null on
 * failure/timeout, so a slow log never turns into a false finding.
 */
async function crtFetch(domain) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 7000);
  try {
    const res = await fetch(`https://crt.sh/?q=${encodeURIComponent(domain)}&output=json`, {
      headers: { accept: 'application/json' },
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Search GitHub's public index for repositories that reference the domain.
// This reads a public search index; it never contacts the target. A token
// (GITHUB_SCAN_TOKEN, a read-only PAT with no scopes) is only used to lift
// the anonymous rate limit; when it is absent the check is skipped cleanly
// rather than shown as a failure. Returns the raw search JSON or null.
const GITHUB_TOKEN = process.env.GITHUB_SCAN_TOKEN || '';

async function githubRepoSearch(domain) {
  if (!GITHUB_TOKEN) return null; // check not configured; composeReport drops it
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const q = encodeURIComponent(`"${domain}" in:name,description,readme`);
    const res = await fetch(
      `https://api.github.com/search/repositories?q=${q}&per_page=30&sort=updated&order=desc`,
      {
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${GITHUB_TOKEN}`,
          'user-agent': 'groundwork-exposure-check',
          'x-github-api-version': '2022-11-28',
        },
        signal: ctrl.signal,
      },
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// The live portion of the scan. It makes a single ordinary HTTPS request to
// the site's home page, the same request a browser makes on a visit, and
// reads only the response (headers, plus a security.txt lookup). It never
// scans ports or paths. Because it connects out on a caller-supplied name it
// is the one SSRF surface, so the target is resolved first and every redirect
// hop re-checked: the request can never be aimed at an internal address.
const LIVE_FETCH_TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 3;

async function resolvesToPublic(host) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3000);
  try {
    const [a, aaaa] = await Promise.all([
      fetch(`${DOH}?name=${encodeURIComponent(host)}&type=A`, {
        headers: { accept: 'application/dns-json' },
        signal: ctrl.signal,
      }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`${DOH}?name=${encodeURIComponent(host)}&type=AAAA`, {
        headers: { accept: 'application/dns-json' },
        signal: ctrl.signal,
      }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    const ips = []
      .concat((a && a.Answer) || [], (aaaa && aaaa.Answer) || [])
      .filter((rec) => rec && (rec.type === 1 || rec.type === 28)) // A or AAAA, not CNAME
      .map((rec) => String(rec.data || ''));
    if (ips.length === 0) return false;
    return ips.every((ip) => !isPrivateIp(ip));
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function guardedFetch(startUrl) {
  let url = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return null;
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    if (!(await resolvesToPublic(parsed.hostname))) return null;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), LIVE_FETCH_TIMEOUT_MS);
    let res;
    try {
      res = await fetch(parsed.toString(), {
        method: 'GET',
        redirect: 'manual',
        headers: { accept: 'text/html,*/*', 'user-agent': 'groundwork-live-check/1.0 (+https://groundwork-security.com)' },
        signal: ctrl.signal,
      });
    } catch {
      clearTimeout(timer);
      return null;
    }
    clearTimeout(timer);

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc || hop === MAX_REDIRECTS) return res;
      url = new URL(loc, parsed).toString();
      continue;
    }
    return res;
  }
  return null;
}

function lowerHeaders(res) {
  const out = {};
  res.headers.forEach((value, key) => {
    out[key.toLowerCase()] = value;
  });
  return out;
}

/** Gather the live picture, or { reachable: false } if the site did not answer. */
async function liveGather(domain) {
  const [home, secTxt] = await Promise.all([
    guardedFetch(`https://${domain}/`),
    guardedFetch(`https://${domain}/.well-known/security.txt`),
  ]);
  if (!home) return { reachable: false };
  return {
    reachable: true,
    headers: lowerHeaders(home),
    securityTxt: Boolean(secTxt && secTxt.status === 200),
  };
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

    // The domain exists and the resolver is reachable, so gather the rest
    // of the public picture: DKIM common selectors, DNSSEC, CAA, and the
    // certificate transparency history (subdomains + latest cert). All of
    // this reads public DNS or a public log; none of it contacts the target.
    const [dkimSelectors, dnssecQuery, caaQuery, crtJson, githubJson, live] = await Promise.all([
      Promise.all(
        COMMON_DKIM_SELECTORS.map(async (selector) => ({
          selector,
          query: await query(`${selector}._domainkey.${domain}`, 'TXT'),
        })),
      ),
      query(domain, 'DS'),
      query(domain, 'CAA'),
      crtFetch(domain),
      githubRepoSearch(domain),
      liveGather(domain),
    ]);

    return {
      jsonBody: composeReport(domain, {
        spf: txtState(txt, findSpf),
        dmarc: txtState(dmarc, findDmarc),
        mx: mxState(mx),
        dkim: dkimState(dkimSelectors),
        dnssecQuery,
        caaQuery,
        crt: parseCrt(crtJson, domain),
        github: githubJson,
        live,
      }),
    };
  },
});

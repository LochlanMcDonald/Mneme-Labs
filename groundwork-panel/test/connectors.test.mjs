// Connector test suite. Each vendor's API is imitated by a local mock
// server that enforces that vendor's real auth mechanics (bearer token
// exchange, ApiToken header, Basic auth, signed service-account JWT), and
// each connector is asserted on: correct severity counts, token caching
// where the vendor uses tokens, and a plain-language error on rejected
// credentials. Run with: npm test
import { createServer } from 'node:http';
import { createVerify, generateKeyPairSync } from 'node:crypto';

let passed = 0;
let failed = 0;

function check(name, cond, detail = '') {
  if (cond) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${name}${detail ? ` (${detail})` : ''}`);
  }
}

function listen(handler) {
  const srv = createServer(handler);
  return new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok({ srv, url: `http://127.0.0.1:${srv.address().port}` })));
}

async function body(req) {
  let b = '';
  for await (const c of req) b += c;
  return b;
}

function json(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(data));
}

// ---------------------------------------------------------------- GitHub
async function testGithub() {
  console.log('GitHub (static token, Link-header pagination totals)');
  const { poll } = await import('../connectors/github.mjs');
  const { srv, url } = await listen((req, res) => {
    if (req.headers.authorization !== 'Bearer tok-good') return json(res, 401, {});
    const u = new URL(req.url, url);
    if (u.pathname === '/orgs/nimbus/secret-scanning/alerts') {
      // 2 open secret alerts, reported via the rel="last" page number.
      res.writeHead(200, {
        'content-type': 'application/json',
        link: `<${url}${u.pathname}?state=open&per_page=1&page=2>; rel="last"`,
      });
      return res.end('[{}]');
    }
    if (u.pathname === '/orgs/nimbus/code-scanning/alerts') return json(res, 404, {}); // feature off
    if (u.pathname === '/users/nimbus/code-scanning/alerts') return json(res, 404, {});
    if (u.pathname === '/orgs/nimbus/dependabot/alerts') return json(res, 200, [{}]); // 1, no Link
    return json(res, 404, {});
  });

  const r = await poll({ org: 'nimbus', token: 'tok-good', apiUrl: url });
  check('counts 2 secret + 1 dependabot, code scanning off', r.total === 3, JSON.stringify(r));
  check('secrets surface as critical', r.severities.critical === 2, JSON.stringify(r.severities));
  check('dependabot surfaces as low', r.severities.low === 1);

  let err = '';
  await poll({ org: 'nimbus', token: 'tok-bad', apiUrl: url }).catch((e) => (err = e.message));
  check('bad token yields a plain error', err.includes('could not read'), err);
  srv.close();
}

// ----------------------------------------------------------- CrowdStrike
async function testCrowdstrike() {
  console.log('CrowdStrike Falcon (OAuth2 client-credentials, cached bearer)');
  const { poll } = await import('../connectors/crowdstrike.mjs');
  let mints = 0;
  const totals = { Critical: 1, High: 3, Medium: 2, Low: 7 };
  const { srv, url } = await listen(async (req, res) => {
    if (req.url === '/oauth2/token' && req.method === 'POST') {
      const p = new URLSearchParams(await body(req));
      if (p.get('client_id') !== 'cs-id' || p.get('client_secret') !== 'cs-sec') return json(res, 401, {});
      mints += 1;
      return json(res, 201, { access_token: `cs-tok-${mints}`, expires_in: 1799 });
    }
    if (req.url.startsWith('/alerts/queries/alerts/v2')) {
      if (req.headers.authorization !== 'Bearer cs-tok-1') return json(res, 403, {});
      const filter = decodeURIComponent(new URL(req.url, url).searchParams.get('filter'));
      const sev = filter.match(/severity_name:'(\w+)'/)?.[1];
      return json(res, 200, { resources: [], meta: { pagination: { total: totals[sev] ?? 0 } } });
    }
    return json(res, 404, {});
  });

  const creds = { clientId: 'cs-id', clientSecret: 'cs-sec', baseUrl: url };
  const r1 = await poll(creds);
  check('counts 13 across four severities', r1.total === 13, JSON.stringify(r1));
  check('severity split is 1/3/2/7', JSON.stringify(r1.severities) === '{"critical":1,"high":3,"medium":2,"low":7}');
  await poll(creds);
  check('second poll reuses the cached token (1 mint)', mints === 1, `mints=${mints}`);
  let err = '';
  await poll({ ...creds, clientSecret: 'wrong' }).catch((e) => (err = e.message));
  check('bad secret yields a plain error', err.includes('rejected'), err);
  srv.close();
}

// -------------------------------------------------------------- Defender
async function testDefender() {
  console.log('Microsoft Defender (Entra client-credentials, Graph $count)');
  const { poll } = await import('../connectors/defender.mjs');
  let mints = 0;
  const counts = { high: 2, medium: 5, low: 1, informational: 4 };
  const { srv, url } = await listen(async (req, res) => {
    if (req.url === '/tenant-1/oauth2/v2.0/token' && req.method === 'POST') {
      const p = new URLSearchParams(await body(req));
      if (p.get('client_id') !== 'app-1' || p.get('client_secret') !== 'app-sec') return json(res, 401, {});
      if (p.get('grant_type') !== 'client_credentials') return json(res, 400, {});
      mints += 1;
      return json(res, 200, { access_token: `ms-tok-${mints}`, expires_in: 3599 });
    }
    if (req.url.startsWith('/v1.0/security/alerts_v2')) {
      if (req.headers.authorization !== 'Bearer ms-tok-1') return json(res, 401, {});
      if (req.headers.consistencylevel !== 'eventual') return json(res, 400, { error: 'missing ConsistencyLevel' });
      const filter = decodeURIComponent(new URL(req.url, url).searchParams.get('$filter'));
      const sev = filter.match(/severity eq '(\w+)'/)?.[1];
      return json(res, 200, { '@odata.count': counts[sev] ?? 0, value: [] });
    }
    return json(res, 404, {});
  });

  const creds = { tenantId: 'tenant-1', clientId: 'app-1', clientSecret: 'app-sec', loginUrl: url, graphUrl: url };
  const r = await poll(creds);
  check('counts 12 new alerts', r.total === 12, JSON.stringify(r));
  check('informational folds into low (1+4=5)', r.severities.low === 5, JSON.stringify(r.severities));
  check('high/medium map straight through', r.severities.high === 2 && r.severities.medium === 5);
  await poll(creds);
  check('second poll reuses the cached token (1 mint)', mints === 1, `mints=${mints}`);
  let err = '';
  await poll({ ...creds, clientSecret: 'nope' }).catch((e) => (err = e.message));
  check('bad secret yields a plain error', err.includes('rejected'), err);
  srv.close();
}

// ------------------------------------------------------------ SentinelOne
async function testSentinelone() {
  console.log('SentinelOne (static ApiToken header, pagination totals)');
  const { poll } = await import('../connectors/sentinelone.mjs');
  const { srv, url } = await listen((req, res) => {
    if (req.headers.authorization !== 'ApiToken s1-tok') return json(res, 401, {});
    const u = new URL(req.url, url);
    if (u.pathname === '/web/api/v2.1/threats') {
      if (u.searchParams.get('resolved') !== 'false') return json(res, 400, {});
      const level = u.searchParams.get('confidenceLevel');
      const totals = { malicious: 2, suspicious: 6 };
      return json(res, 200, { data: [], pagination: { totalItems: totals[level] ?? 0 } });
    }
    return json(res, 404, {});
  });

  const r = await poll({ baseUrl: url, apiToken: 's1-tok' });
  check('counts 8 unresolved threats', r.total === 8, JSON.stringify(r));
  check('malicious surfaces as high, suspicious as medium', r.severities.high === 2 && r.severities.medium === 6);
  let err = '';
  await poll({ baseUrl: url, apiToken: 'wrong' }).catch((e) => (err = e.message));
  check('bad token yields a plain error', err.includes('rejected'), err);
  srv.close();
}

// -------------------------------------------------------------- Proofpoint
async function testProofpoint() {
  console.log('Proofpoint TAP (HTTP Basic, SIEM /all events)');
  const { poll } = await import('../connectors/proofpoint.mjs');
  const good = Buffer.from('pp-principal:pp-secret').toString('base64');
  const { srv, url } = await listen((req, res) => {
    if (req.headers.authorization !== `Basic ${good}`) return json(res, 401, {});
    const u = new URL(req.url, url);
    if (u.pathname === '/v2/siem/all') {
      if (Number(u.searchParams.get('sinceSeconds')) > 3600) return json(res, 400, {});
      return json(res, 200, {
        messagesDelivered: [{}, {}],
        clicksPermitted: [{}],
        messagesBlocked: [{}, {}, {}],
        clicksBlocked: [{}],
      });
    }
    return json(res, 404, {});
  });

  const r = await poll({ principal: 'pp-principal', secret: 'pp-secret', baseUrl: url });
  check('counts 7 events in the last hour', r.total === 7, JSON.stringify(r));
  check('threats that got through surface as high (2+1)', r.severities.high === 3);
  check('blocked threats surface as low (3+1)', r.severities.low === 4);
  let err = '';
  await poll({ principal: 'pp-principal', secret: 'wrong', baseUrl: url }).catch((e) => (err = e.message));
  check('bad secret yields a plain error', err.includes('rejected'), err);
  srv.close();
}

// -------------------------------------------------------- Google Workspace
async function testGworkspace() {
  console.log('Google Workspace (service-account JWT signed locally, verified by the mock)');
  const { poll } = await import('../connectors/gworkspace.mjs');
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  let mints = 0;
  let sawValidSignature = false;
  const { srv, url } = await listen(async (req, res) => {
    if (req.url === '/token' && req.method === 'POST') {
      const p = new URLSearchParams(await body(req));
      const jwt = p.get('assertion') || '';
      const [h, c, sig] = jwt.split('.');
      // The mock verifies the RS256 signature with the real public key and
      // checks the delegation claims, like Google would.
      const okSig = createVerify('RSA-SHA256').update(`${h}.${c}`).verify(publicKey, Buffer.from(sig, 'base64url'));
      const claims = JSON.parse(Buffer.from(c, 'base64url').toString());
      if (!okSig || claims.iss !== 'panel@sa.iam.gserviceaccount.com' || claims.sub !== 'admin@nimbus.io') {
        return json(res, 401, {});
      }
      sawValidSignature = true;
      mints += 1;
      return json(res, 200, { access_token: `g-tok-${mints}`, expires_in: 3599 });
    }
    if (req.url.startsWith('/v1beta1/alerts')) {
      if (req.headers.authorization !== 'Bearer g-tok-1') return json(res, 401, {});
      return json(res, 200, {
        alerts: [
          { metadata: { severity: 'HIGH' } },
          { metadata: { severity: 'MEDIUM' } },
          { metadata: { severity: 'MEDIUM' } },
          {}, // no severity reported -> low
        ],
      });
    }
    return json(res, 404, {});
  });

  const sa = {
    client_email: 'panel@sa.iam.gserviceaccount.com',
    private_key: privateKey,
    token_uri: `${url}/token`,
  };
  const creds = { serviceAccountJson: JSON.stringify(sa), delegatedAdmin: 'admin@nimbus.io', apiUrl: url };
  const r = await poll(creds);
  check('mock verified the RS256 signature', sawValidSignature);
  check('counts 4 alert center alerts', r.total === 4, JSON.stringify(r));
  check('severity mapping 1 high / 2 medium / 1 low', r.severities.high === 1 && r.severities.medium === 2 && r.severities.low === 1);
  await poll(creds);
  check('second poll reuses the cached token (1 mint)', mints === 1, `mints=${mints}`);
  let err = '';
  const badSa = { ...sa, client_email: 'intruder@sa.iam.gserviceaccount.com' };
  await poll({ ...creds, serviceAccountJson: JSON.stringify(badSa) }).catch((e) => (err = e.message));
  check('wrong service account yields a plain error', err.includes('rejected'), err);
  srv.close();
}

// ------------------------------------------------------------------- run
for (const t of [testGithub, testCrowdstrike, testDefender, testSentinelone, testProofpoint, testGworkspace]) {
  await t();
}
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log('ALL CONNECTOR TESTS PASSED');

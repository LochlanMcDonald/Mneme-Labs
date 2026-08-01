#!/usr/bin/env node
// The Groundwork Panel local runtime. Serves the built dashboard on
// localhost and does the vendor polling that browsers cannot (vendor APIs
// do not allow cross-origin calls from pages). Credentials live in a
// config file in the user's home directory, chmod 600, and are only ever
// sent to the vendor's own API.

import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, chmod } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PORT = Number(process.env.PANEL_PORT || 7439);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(HERE, 'dist');
const CONFIG_DIR = path.join(homedir(), '.groundwork-panel');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const CONNECTORS = {
  github: () => import('./connectors/github.mjs'),
  crowdstrike: () => import('./connectors/crowdstrike.mjs'),
  defender: () => import('./connectors/defender.mjs'),
  sentinel: () => import('./connectors/sentinel.mjs'),
  proofpoint: () => import('./connectors/proofpoint.mjs'),
  gworkspace: () => import('./connectors/gworkspace.mjs'),
};

async function loadConfig() {
  try {
    return JSON.parse(await readFile(CONFIG_FILE, 'utf8'));
  } catch {
    return { vendors: [] };
  }
}

async function saveConfig(config) {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
  await chmod(CONFIG_FILE, 0o600).catch(() => {});
}

/** The vendor list with credentials stripped; only this shape leaves the server. */
function publicVendors(config) {
  return (config.vendors ?? []).map((v) => ({
    id: v.id,
    consoleUrl: v.consoleUrl || '',
    seenTotal: v.seenTotal ?? 0,
  }));
}

async function runPoll(config, id) {
  const vendor = (config.vendors ?? []).find((v) => v.id === id);
  if (!vendor) throw new Error(`No configured vendor "${id}"`);
  const loader = CONNECTORS[id];
  if (!loader) throw new Error(`No connector for "${id}" yet`);
  const mod = await loader();
  const data = await mod.poll(vendor.creds ?? {});
  return {
    id,
    ok: true,
    total: data.total,
    severities: data.severities,
    checkedAt: new Date().toISOString(),
  };
}

async function readJson(req) {
  let body = '';
  for await (const chunk of req) body += chunk;
  return body ? JSON.parse(body) : {};
}

function send(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(data));
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (url.pathname === '/panel-api/config' && req.method === 'GET') {
      const config = await loadConfig();
      return send(res, 200, { vendors: publicVendors(config) });
    }

    if (url.pathname === '/panel-api/config' && req.method === 'POST') {
      const body = await readJson(req);
      const id = String(body.id || '');
      if (!id) return send(res, 400, { error: 'Vendor id is required' });
      const config = await loadConfig();
      config.vendors = (config.vendors ?? []).filter((v) => v.id !== id);
      config.vendors.push({
        id,
        creds: body.creds ?? {},
        consoleUrl: String(body.consoleUrl || ''),
        seenTotal: 0,
      });
      // Prove the credentials work before keeping them.
      let check;
      try {
        check = await runPoll(config, id);
      } catch (err) {
        return send(res, 400, { error: err.message || 'The connection check failed' });
      }
      await saveConfig(config);
      return send(res, 200, { vendors: publicVendors(config), check });
    }

    if (url.pathname === '/panel-api/config' && req.method === 'DELETE') {
      const bodyData = await readJson(req);
      const id = String(bodyData.id || '');
      const config = await loadConfig();
      config.vendors = (config.vendors ?? []).filter((v) => v.id !== id);
      await saveConfig(config);
      return send(res, 200, { vendors: publicVendors(config) });
    }

    if (url.pathname === '/panel-api/poll' && req.method === 'POST') {
      const body = await readJson(req);
      const config = await loadConfig();
      try {
        return send(res, 200, await runPoll(config, String(body.id || '')));
      } catch (err) {
        return send(res, 200, {
          id: String(body.id || ''),
          ok: false,
          total: 0,
          severities: { critical: 0, high: 0, medium: 0, low: 0 },
          checkedAt: new Date().toISOString(),
          error: err.message || 'Poll failed',
        });
      }
    }

    if (url.pathname === '/panel-api/seen' && req.method === 'POST') {
      const body = await readJson(req);
      const config = await loadConfig();
      const vendor = (config.vendors ?? []).find((v) => v.id === body.id);
      if (vendor) {
        vendor.seenTotal = Number(body.seenTotal) || 0;
        await saveConfig(config);
      }
      return send(res, 200, { ok: true });
    }

    // Static files from the built dashboard.
    const file = url.pathname === '/' ? '/index.html' : url.pathname;
    const full = path.normalize(path.join(DIST, file));
    if (!full.startsWith(DIST)) return send(res, 403, { error: 'Forbidden' });
    try {
      const data = await readFile(full);
      res.writeHead(200, { 'content-type': MIME[path.extname(full)] || 'application/octet-stream' });
      return res.end(data);
    } catch {
      return send(res, 404, { error: 'Not found. Run "npm run build" first.' });
    }
  } catch (err) {
    return send(res, 500, { error: err.message || 'Server error' });
  }
});

/** Start the local runtime. Exported so the desktop app can embed it. */
export function startPanelServer(port = PORT) {
  server.listen(port, '127.0.0.1', () => {
    console.log(`Groundwork Panel running at http://localhost:${port}`);
    console.log(`Config: ${CONFIG_FILE}`);
  });
  return server;
}

// Started directly (npm start / npx groundwork-panel): run immediately.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startPanelServer();
}

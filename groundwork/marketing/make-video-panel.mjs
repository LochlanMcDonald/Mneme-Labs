// The Panel ad. Sleek and to the point: dark cards, the live board, one
// interaction, the trust line, done. No startup framing; written to land
// for any company size.
// Usage: (panel server on :7439) node marketing/make-video-panel.mjs
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const workDir = path.join(here, '.video-panel-work');
fs.rmSync(workDir, { recursive: true, force: true });
fs.mkdirSync(workDir, { recursive: true });

const SIZE = { width: 1280, height: 720 };
const APP = process.env.PANEL_URL || 'http://localhost:7439/';
const OUT = path.join(here, process.env.OUT_NAME || 'panel-ad-16x9.mp4');

// White variant of the mark for dark cards.
const MARK_WHITE =
  `<svg viewBox="0 0 100 100" style="width:1.35em;height:1.35em;vertical-align:-0.32em;margin-right:8px">` +
  `<polygon points="44,22 62,31 44,40 26,31" fill="#ffffff"/>` +
  `<polygon points="26,31 44,40 44,47 26,38" fill="rgba(255,255,255,.72)"/>` +
  `<polygon points="62,31 44,40 44,47 62,38" fill="rgba(255,255,255,.45)"/>` +
  `<polygon points="56,38 74,47 56,56 38,47" fill="#ffffff"/>` +
  `<polygon points="38,47 56,56 56,63 38,54" fill="rgba(255,255,255,.72)"/>` +
  `<polygon points="74,47 56,56 56,63 74,54" fill="rgba(255,255,255,.45)"/>` +
  `<polygon points="44,54 62,63 44,72 26,63" fill="#ffffff"/>` +
  `<polygon points="26,63 44,72 44,79 26,70" fill="rgba(255,255,255,.72)"/>` +
  `<polygon points="62,63 44,72 44,79 62,70" fill="rgba(255,255,255,.45)"/></svg>`;

// Dark, restrained card: ink background, one soft blueberry glow.
const card = (title, subtitle, opts = {}) => {
  const { eyebrow = '', cta = '', small = '' } = opts;
  return `<!doctype html><html><head><style>
  * { margin:0; box-sizing:border-box; }
  body { width:1280px; height:720px; display:flex; align-items:center; justify-content:center;
    background:
      radial-gradient(820px 520px at 78% -14%, rgba(47,107,255,.28), transparent 62%),
      radial-gradient(640px 460px at -8% 110%, rgba(139,92,246,.16), transparent 60%),
      #101f38;
    font-family:'Inter',-apple-system,'Segoe UI',Roboto,sans-serif; color:#ffffff; text-align:center; }
  .in { max-width: 1020px; padding: 0 60px; }
  .brand { display:inline-flex; align-items:center; font-weight:800; font-size:27px; margin-bottom:36px; color:#ffffff; }
  .brand em { font-style:normal; color:#8fb0ff; margin-left:8px; }
  .eyebrow { color:#8fb0ff; font-weight:800; letter-spacing:.14em; text-transform:uppercase; font-size:19px; margin-bottom:20px; }
  h1 { font-size:58px; letter-spacing:-0.03em; line-height:1.1; font-weight:800; }
  p { color:#b6c4dd; font-size:27px; margin-top:22px; line-height:1.42; }
  .cta { display:inline-block; margin-top:36px; font-weight:800; font-size:27px; color:#8fb0ff; }
  .small { margin-top:14px; color:#7a8ca9; font-size:20px; font-weight:600; }
</style></head><body><div class="in">
  <div class="brand">${MARK_WHITE} Groundwork <em>Panel</em></div>
  ${eyebrow ? `<div class="eyebrow">${eyebrow}</div>` : ''}
  <h1>${title}</h1>
  ${subtitle ? `<p>${subtitle}</p>` : ''}
  ${cta ? `<div class="cta">${cta}</div>` : ''}
  ${small ? `<div class="small">${small}</div>` : ''}
</div></body></html>`;
};

const INIT_SCRIPT = `
  const dot = document.createElement('div');
  dot.style.cssText = 'position:fixed;z-index:99999;width:22px;height:22px;border-radius:50%;' +
    'background:rgba(47,107,255,.32);border:2.5px solid #2f6bff;pointer-events:none;' +
    'transform:translate(-50%,-50%);transition:width .12s,height .12s;left:-50px;top:-50px';
  const attach = () => { if (document.body) document.body.appendChild(dot); };
  document.readyState === 'loading' ? addEventListener('DOMContentLoaded', attach) : attach();
  addEventListener('mousemove', (e) => { dot.style.left = e.clientX + 'px'; dot.style.top = e.clientY + 'px'; }, true);
  addEventListener('mousedown', () => { dot.style.width = '30px'; dot.style.height = '30px'; }, true);
  addEventListener('mouseup', () => { dot.style.width = '22px'; dot.style.height = '22px'; }, true);
`;

// The board is staged in its live (configured) state, so interactions
// respond on camera: six consoles with plausible counts.
const CONFIG = {
  vendors: [
    { id: 'defender', consoleUrl: '', seenTotal: 4 },
    { id: 'crowdstrike', consoleUrl: '', seenTotal: 0 },
    { id: 'sentinel', consoleUrl: '', seenTotal: 0 },
    { id: 'proofpoint', consoleUrl: '', seenTotal: 0 },
    { id: 'gworkspace', consoleUrl: '', seenTotal: 2 },
    { id: 'github', consoleUrl: '', seenTotal: 1 },
  ],
};
const POLLS = {
  defender: { total: 7, severities: { critical: 0, high: 1, medium: 4, low: 2 } },
  crowdstrike: { total: 0, severities: { critical: 0, high: 0, medium: 0, low: 0 } },
  sentinel: { total: 1, severities: { critical: 0, high: 1, medium: 0, low: 0 } },
  proofpoint: { total: 2, severities: { critical: 0, high: 2, medium: 0, low: 0 } },
  gworkspace: { total: 2, severities: { critical: 0, high: 0, medium: 2, low: 0 } },
  github: { total: 4, severities: { critical: 1, high: 0, medium: 0, low: 3 } },
};

async function moveClick(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  const box = await locator.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 22 });
  await page.waitForTimeout(300);
  await page.mouse.down();
  await page.waitForTimeout(90);
  await page.mouse.up();
}

async function hover(page, locator, ms = 900) {
  const box = await locator.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 24 });
  await page.waitForTimeout(ms);
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
});
const context = await browser.newContext({ viewport: SIZE, recordVideo: { dir: workDir, size: SIZE } });
await context.addInitScript(INIT_SCRIPT);

const page = await context.newPage();
await page.route('**/panel-api/config', (r) => r.fulfill({ json: CONFIG }));
await page.route('**/panel-api/poll', async (r) => {
  const { id } = JSON.parse(r.request().postData() || '{}');
  const p = POLLS[id] ?? { total: 0, severities: { critical: 0, high: 0, medium: 0, low: 0 } };
  await r.fulfill({ json: { id, ok: true, ...p, checkedAt: new Date().toISOString() } });
});
await page.route('**/panel-api/seen', (r) => r.fulfill({ json: { ok: true } }));

await page.goto('about:blank');
await page.waitForTimeout(800);

// ── The question ──
await page.setContent(
  card('How many consoles did you open this morning?', 'Defender. Sentinel. CrowdStrike. Proofpoint. Workspace. GitHub.'),
);
await page.waitForTimeout(3400);
await page.setContent(card('One board. Every console.'));
await page.waitForTimeout(2200);

// ── The board ──
await page.goto(APP);
await page.waitForSelector('.tile');
await page.waitForTimeout(2600);
await hover(page, page.locator('.tile:has-text("Microsoft Sentinel")'), 1100);
await hover(page, page.locator('.tile:has-text("GitHub") .tile-link'), 1100);
await moveClick(page, page.locator('.tile:has-text("Microsoft Defender") .tile-reviewed'));
await page.waitForTimeout(2300);

// ── Trust ──
await page.setContent(
  card('Your API keys never leave your machine.', 'Panel talks straight to each vendor. Nothing routes through us.'),
);
await page.waitForTimeout(3200);

// ── The six consoles ──
await page.goto(APP);
await page.waitForSelector('.tile');
await page.waitForTimeout(400);
await moveClick(page, page.locator('button:has-text("Add a console")'));
await page.waitForSelector('.picker-card');
await page.waitForTimeout(1000);
await hover(page, page.locator('.picker-card:has-text("CrowdStrike")'), 900);
await hover(page, page.locator('.picker-card:has-text("Google Workspace")'), 900);
await page.waitForTimeout(500);

// ── Close ──
await page.setContent(
  card('Every console. One glance.', '', {
    cta: 'groundwork-security.com/#/panel',
    small: '$14.99 a month · Mac and Windows · Cancel anytime',
  }),
);
await page.waitForTimeout(3400);
await page.close();
await context.close();
await browser.close();

const ffmpeg =
  process.env.FFMPEG_PATH ||
  execFileSync('python3', ['-c', 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())']).toString().trim();

const webm = fs.readdirSync(workDir).filter((f) => f.endsWith('.webm')).map((f) => path.join(workDir, f))[0];
execFileSync(ffmpeg, [
  '-y', '-i', webm,
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '21',
  '-pix_fmt', 'yuv420p', '-r', '30', '-an', '-movflags', '+faststart', OUT,
]);
console.log('wrote', OUT, `(${(fs.statSync(OUT).size / 1e6).toFixed(1)} MB)`);
fs.rmSync(workDir, { recursive: true, force: true });

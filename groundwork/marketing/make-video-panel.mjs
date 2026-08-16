// The Panel ad, motion-graphics style. No screencast and no cursor: the
// product appears as high-resolution stills with slow camera moves and
// crossfades, assembled at a clean 30fps. Sleek, short, professional.
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

const APP = process.env.PANEL_URL || 'http://localhost:7439/';
const OUT = path.join(here, process.env.OUT_NAME || 'panel-ad-16x9.mp4');
const FPS = 30;
const FADE = 0.6; // crossfade seconds between shots

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

const card = (title, subtitle, opts = {}) => {
  const { cta = '', small = '' } = opts;
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
  h1 { font-size:58px; letter-spacing:-0.03em; line-height:1.1; font-weight:800; }
  p { color:#b6c4dd; font-size:27px; margin-top:22px; line-height:1.42; }
  .cta { display:inline-block; margin-top:36px; font-weight:800; font-size:27px; color:#8fb0ff; }
  .small { margin-top:14px; color:#7a8ca9; font-size:20px; font-weight:600; }
</style></head><body><div class="in">
  <div class="brand">${MARK_WHITE} Groundwork <em>Panel</em></div>
  <h1>${title}</h1>
  ${subtitle ? `<p>${subtitle}</p>` : ''}
  ${cta ? `<div class="cta">${cta}</div>` : ''}
  ${small ? `<div class="small">${small}</div>` : ''}
</div></body></html>`;
};

// The board is staged in its live (configured) state.
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

// ── Phase one: render stills at 2x for sharp camera moves ──
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();
await page.route('**/panel-api/config', (r) => r.fulfill({ json: CONFIG }));
await page.route('**/panel-api/poll', async (r) => {
  const { id } = JSON.parse(r.request().postData() || '{}');
  const p = POLLS[id] ?? { total: 0, severities: { critical: 0, high: 0, medium: 0, low: 0 } };
  await r.fulfill({ json: { id, ok: true, ...p, checkedAt: new Date().toISOString() } });
});
await page.route('**/panel-api/seen', (r) => r.fulfill({ json: { ok: true } }));

const still = async (name, html) => {
  if (html) await page.setContent(html);
  await page.waitForTimeout(html ? 250 : 0);
  await page.screenshot({ path: path.join(workDir, name) });
};

await still('c1.png', card(
  'How many consoles did you open this morning?',
  'Defender. Sentinel. CrowdStrike. Proofpoint. Workspace. GitHub.',
));
await still('c2.png', card('One board. Every console.'));
await still('c4.png', card(
  'Your API keys never leave your machine.',
  'Panel talks straight to each vendor. Nothing routes through us.',
));
await still('c6.png', card('Every console. One glance.', '', {
  cta: 'groundwork-security.com/#/panel',
  small: '$14.99 a month · Mac and Windows · Cancel anytime',
}));

await page.goto(APP);
await page.waitForSelector('.tile');
await page.waitForTimeout(1200);
await still('board.png');
await context.close();
await browser.close();

// ── Phase two: camera moves and crossfades ──
const ffmpeg =
  process.env.FFMPEG_PATH ||
  execFileSync('python3', ['-c', 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())']).toString().trim();

// Each shot: image, seconds on screen, and a camera move.
// Moves: 'push' = slow zoom in, centered. 'pan' = fixed closeup drifting
// sideways across the tiles. Cards get a barely-there push so nothing is
// ever frozen.
const SHOTS = [
  { img: 'c1.png', dur: 3.6, move: 'push', amt: 0.05 },
  { img: 'c2.png', dur: 2.4, move: 'push', amt: 0.04 },
  { img: 'board.png', dur: 5.6, move: 'push', amt: 0.1 },
  { img: 'board.png', dur: 4.6, move: 'pan', zoom: 1.7, y: 250 },
  { img: 'c4.png', dur: 3.4, move: 'push', amt: 0.05 },
  { img: 'c6.png', dur: 4.4, move: 'push', amt: 0.04 },
];

const clips = SHOTS.map((s, i) => {
  const D = Math.round(s.dur * FPS);
  const clip = path.join(workDir, `clip${i}.mp4`);
  const zexpr =
    s.move === 'pan' ? String(s.zoom) : `1+${s.amt}*on/${D}`;
  const xexpr = s.move === 'pan' ? `(iw-iw/zoom)*on/${D}` : `iw/2-(iw/zoom/2)`;
  const yexpr = s.move === 'pan' ? String(s.y) : `ih/2-(ih/zoom/2)`;
  const filters = [
    `zoompan=z='${zexpr}':x='${xexpr}':y='${yexpr}':d=${D}:s=1280x720:fps=${FPS}`,
  ];
  if (i === 0) filters.push(`fade=t=in:st=0:d=0.5`);
  if (i === SHOTS.length - 1) filters.push(`fade=t=out:st=${(s.dur - 0.7).toFixed(2)}:d=0.7`);
  execFileSync(ffmpeg, [
    '-y', '-loglevel', 'error',
    '-i', path.join(workDir, s.img),
    '-vf', filters.join(','),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p',
    clip,
  ]);
  return { clip, dur: s.dur };
});

// Chain crossfades: each offset is the accumulated visible time so far.
const inputs = clips.flatMap((c) => ['-i', c.clip]);
let offset = 0;
const parts = [];
let prev = '[0:v]';
for (let i = 1; i < clips.length; i++) {
  offset += clips[i - 1].dur - FADE;
  const label = i === clips.length - 1 ? '[v]' : `[x${i}]`;
  parts.push(`${prev}[${i}:v]xfade=transition=fade:duration=${FADE}:offset=${offset.toFixed(2)}${label}`);
  prev = `[x${i}]`;
}
execFileSync(ffmpeg, [
  '-y', '-loglevel', 'error',
  ...inputs,
  '-filter_complex', parts.join(';'),
  '-map', '[v]',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
  '-r', String(FPS), '-an', '-movflags', '+faststart', OUT,
]);
console.log('wrote', OUT, `(${(fs.statSync(OUT).size / 1e6).toFixed(1)} MB)`);
fs.rmSync(workDir, { recursive: true, force: true });

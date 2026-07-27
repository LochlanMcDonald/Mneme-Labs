// A second promo, distinct from the main demo. No wizard walkthrough:
// this one is the bad-day story. The wrong-link moment into the phishing
// playbook, then the Friday questionnaire into the plan and the report.
// Usage: npm run build && vite preview --port 4173 & node marketing/make-video2.mjs
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const workDir = path.join(here, '.video2-work');
fs.rmSync(workDir, { recursive: true, force: true });
fs.mkdirSync(workDir, { recursive: true });

const SIZE = { width: 1280, height: 720 };
const APP = process.env.APP_URL || 'http://localhost:4173/';
const OUT = path.join(here, process.env.OUT_NAME || 'instagram/moments-video-16x9.mp4');

const MARK =
  `<svg viewBox="0 0 100 100" style="width:1.35em;height:1.35em;vertical-align:-0.32em;margin-right:6px">` +
  `<polygon points="44,22 62,31 44,40 26,31" fill="#ffbe8f"/>` +
  `<polygon points="26,31 44,40 44,47 26,38" fill="#ff8b3d"/>` +
  `<polygon points="62,31 44,40 44,47 62,38" fill="#e86f1f"/>` +
  `<polygon points="56,38 74,47 56,56 38,47" fill="#8fb0ff"/>` +
  `<polygon points="38,47 56,56 56,63 38,54" fill="#2f6bff"/>` +
  `<polygon points="74,47 56,56 56,63 74,54" fill="#1d4ed8"/>` +
  `<polygon points="44,54 62,63 44,72 26,63" fill="#b79bf7"/>` +
  `<polygon points="26,63 44,72 44,79 26,70" fill="#8b5cf6"/>` +
  `<polygon points="62,63 44,72 44,79 62,70" fill="#6d28d9"/></svg>`;

const card = (title, subtitle, opts = {}) => {
  const { eyebrow = '', cta = '' } = opts;
  return `<!doctype html><html><head><style>
  * { margin:0; box-sizing:border-box; }
  body { width:1280px; height:720px; display:flex; align-items:center; justify-content:center;
    background:
      repeating-linear-gradient(0deg, rgba(29,78,216,.022) 0, rgba(29,78,216,.022) 1px, transparent 1px, transparent 6px),
      radial-gradient(760px 470px at 86% -12%, rgba(47,107,255,.26), transparent 60%),
      radial-gradient(620px 420px at -6% 6%, rgba(139,92,246,.22), transparent 58%),
      radial-gradient(560px 400px at 106% 60%, rgba(101,200,55,.16), transparent 58%),
      radial-gradient(700px 470px at 14% 112%, rgba(255,139,61,.22), transparent 60%),
      #f2f5fc;
    font-family:'Inter',-apple-system,'Segoe UI',Roboto,sans-serif; color:#101f38; text-align:center; }
  .in { max-width: 980px; padding: 0 60px; }
  .brand { display:inline-flex; align-items:center; font-weight:800; font-size:28px; margin-bottom:34px; color:#101f38; }
  .eyebrow { color:#c2600f; font-weight:800; letter-spacing:.08em; text-transform:uppercase; font-size:22px; margin-bottom:18px; }
  h1 { font-size:56px; letter-spacing:-0.03em; line-height:1.12; font-weight:800; }
  p { color:#4e6382; font-size:27px; margin-top:22px; line-height:1.4; }
  .cta { display:inline-block; margin-top:34px; font-weight:800; font-size:26px; color:#2f6bff; }
</style></head><body><div class="in">
  <div class="brand">${MARK} Groundwork</div>
  ${eyebrow ? `<div class="eyebrow">${eyebrow}</div>` : ''}
  <h1>${title}</h1>
  ${subtitle ? `<p>${subtitle}</p>` : ''}
  ${cta ? `<div class="cta">${cta}</div>` : ''}
</div></body></html>`;
};

const INIT_SCRIPT = `
  const dot = document.createElement('div');
  dot.style.cssText = 'position:fixed;z-index:99999;width:22px;height:22px;border-radius:50%;' +
    'background:rgba(47,107,255,.32);border:2.5px solid #2f6bff;pointer-events:none;' +
    'transform:translate(-50%,-50%);transition:width .12s,height .12s;left:-50px;top:-50px';
  const attach = () => {
    if (!document.body) return;
    document.body.appendChild(dot);
    const st = document.createElement('style');
    st.textContent = '.pro-badge{display:none!important}';
    document.head.appendChild(st);
  };
  document.readyState === 'loading' ? addEventListener('DOMContentLoaded', attach) : attach();
  addEventListener('mousemove', (e) => { dot.style.left = e.clientX + 'px'; dot.style.top = e.clientY + 'px'; }, true);
  addEventListener('mousedown', () => { dot.style.width = '30px'; dot.style.height = '30px'; }, true);
  addEventListener('mouseup', () => { dot.style.width = '22px'; dot.style.height = '22px'; }, true);
`;

const savedState = {
  profile: {
    companyName: 'Nimbus',
    description: 'A SaaS platform that helps engineering teams ship and scale cloud apps.',
    teamSize: 'small', stage: 'launched', productTypes: ['saas'],
    dataTypes: ['pii', 'payments'], infra: ['azure'], codeHosting: 'github',
    customers: ['b2b', 'enterprise'], workModel: 'remote', deviceModel: 'company',
    complianceTargets: ['soc2'], existing: ['mfa', 'password-manager', 'backups'],
  },
  items: {
    'mfa-everywhere': { status: 'done', note: '' },
    'password-manager': { status: 'done', note: '' },
    backups: { status: 'done', note: '' },
    'disk-encryption': { status: 'done', note: '' },
    'cloud-root-lockdown': { status: 'in-progress', note: '' },
    'branch-protection': { status: 'in-progress', note: '' },
  },
  generatedAt: '2026-07-20T00:00:00.000Z',
};

async function moveClick(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  const box = await locator.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 22 });
  await page.waitForTimeout(260);
  await page.mouse.down();
  await page.waitForTimeout(90);
  await page.mouse.up();
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
});
const context = await browser.newContext({ viewport: SIZE, recordVideo: { dir: workDir, size: SIZE } });
await context.addInitScript(INIT_SCRIPT);

const page = await context.newPage();
await page.route('**/.auth/me', (r) =>
  r.fulfill({ json: { clientPrincipal: { userId: 'u1', userDetails: 'founder@nimbus.dev', identityProvider: 'aad' } } }),
);
await page.route('**/api/me', (r) =>
  r.fulfill({ json: { userId: 'u1', userDetails: 'founder@nimbus.dev', pro: true } }),
);
await page.route('**/api/state', (r) =>
  r.request().method() === 'GET' ? r.fulfill({ json: { state: savedState } }) : r.fulfill({ status: 204 }),
);

await page.goto('about:blank');
await page.waitForTimeout(900);

// ── Act one: the wrong link ──
await page.setContent(
  card('Someone on the team just clicked the wrong link.', 'It happens to careful people every day.', {
    eyebrow: 'The moment it gets real',
  }),
);
await page.waitForTimeout(3000);
await page.setContent(card('The next ten minutes decide how bad it gets.', 'Groundwork keeps the playbook ready.'));
await page.waitForTimeout(2600);

await page.goto(APP + '#/help');
await page.waitForSelector('.help');
await page.waitForTimeout(1400);
await moveClick(page, page.locator('.item-title:has-text("phished")').first());
await page.waitForTimeout(3000);
await page.evaluate(() => window.scrollTo({ top: 230, behavior: 'smooth' }));
await page.waitForTimeout(2800);

// ── Act two: the Friday questionnaire ──
await page.setContent(
  card('A customer wants your security questionnaire back by Friday.', 'Your plan already holds the answers.', {
    eyebrow: 'Also landing this week',
  }),
);
await page.waitForTimeout(3000);

await page.goto(APP);
await page.waitForSelector('.dashboard');
await page.waitForTimeout(1400);
await page.evaluate(() => window.scrollTo({ top: 480, behavior: 'smooth' }));
await page.waitForTimeout(1800);
await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
await page.waitForTimeout(700);
await moveClick(page, page.locator('button:has-text("Security report")'));
await page.waitForSelector('.report');
await page.waitForTimeout(1800);
await page.evaluate(() => window.scrollTo({ top: 620, behavior: 'smooth' }));
await page.waitForTimeout(2000);

// ── Close ──
await page.setContent(
  card('Ready beats lucky.', 'A plan for before. Playbooks for after.', { cta: 'groundwork-security.com' }),
);
await page.waitForTimeout(3200);
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

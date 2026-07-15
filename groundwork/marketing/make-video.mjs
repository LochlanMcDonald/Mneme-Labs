// Records a short silent product demo (title card, wizard flow, dashboard,
// Pro report, end card) against a local preview server, then stitches the
// segments into demo.mp4.
//
// Usage: npm run build && npx vite preview --port 4173 &
//        node marketing/make-video.mjs
// Requires playwright-core and an ffmpeg binary (FFMPEG_PATH env or
// imageio-ffmpeg's bundled binary).
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const workDir = path.join(here, '.video-work');
fs.rmSync(workDir, { recursive: true, force: true });
fs.mkdirSync(workDir, { recursive: true });

const SIZE = { width: 1280, height: 720 };
const APP = 'http://localhost:4173/';

const card = (title, subtitle, accent = '#4f8cff') => `<!doctype html><html><head><style>
  * { margin:0; box-sizing:border-box; }
  body { width:1280px; height:720px; display:flex; align-items:center; justify-content:center;
    background: radial-gradient(900px 500px at 80% -10%, rgba(79,140,255,.2), transparent 60%), #0c111b;
    font-family:'Inter',-apple-system,'Segoe UI',Roboto,sans-serif; color:#e8edf6; text-align:center; }
  .in { max-width: 900px; padding: 0 60px; }
  .brand { color:${accent}; font-weight:800; font-size:30px; margin-bottom:28px; }
  h1 { font-size:56px; letter-spacing:-0.03em; line-height:1.1; font-weight:800; }
  p { color:#9aa8c0; font-size:26px; margin-top:20px; }
</style></head><body><div class="in">
  <div class="brand">⬢ Groundwork</div>
  <h1>${title}</h1>
  ${subtitle ? `<p>${subtitle}</p>` : ''}
</div></body></html>`;

// A visible cursor so viewers can follow the clicks.
const CURSOR_SCRIPT = `
  const dot = document.createElement('div');
  dot.style.cssText = 'position:fixed;z-index:99999;width:22px;height:22px;border-radius:50%;' +
    'background:rgba(79,140,255,.45);border:2.5px solid #7fa8ff;pointer-events:none;' +
    'transform:translate(-50%,-50%);transition:width .12s,height .12s;left:-50px;top:-50px';
  const attach = () => document.body && document.body.appendChild(dot);
  document.readyState === 'loading' ? addEventListener('DOMContentLoaded', attach) : attach();
  addEventListener('mousemove', (e) => { dot.style.left = e.clientX + 'px'; dot.style.top = e.clientY + 'px'; }, true);
  addEventListener('mousedown', () => { dot.style.width = '30px'; dot.style.height = '30px'; }, true);
  addEventListener('mouseup', () => { dot.style.width = '22px'; dot.style.height = '22px'; }, true);
`;

const savedState = {
  profile: {
    companyName: 'VetSched',
    description: 'Scheduling software for veterinary clinics.',
    teamSize: 'small',
    stage: 'launched',
    productTypes: ['saas'],
    dataTypes: ['pii', 'payments'],
    infra: ['azure'],
    codeHosting: 'github',
    customers: ['b2b', 'enterprise'],
    workModel: 'remote',
    deviceModel: 'company',
    complianceTargets: ['soc2'],
    existing: ['mfa', 'password-manager', 'backups'],
  },
  items: {
    'mfa-everywhere': { status: 'done', note: '' },
    'password-manager': { status: 'done', note: '' },
    backups: { status: 'done', note: '' },
    'disk-encryption': { status: 'done', note: '' },
    'cloud-root-lockdown': { status: 'in-progress', note: '' },
    'branch-protection': { status: 'in-progress', note: '' },
  },
  generatedAt: '2026-07-14T00:00:00.000Z',
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
const context = await browser.newContext({
  viewport: SIZE,
  recordVideo: { dir: workDir, size: SIZE },
});
await context.addInitScript(CURSOR_SCRIPT);

// ── Segment 1: hook, landing, wizard, plan reveal ──
const page1 = await context.newPage();
// Let the recording surface reach full size before the first card, or the
// opening seconds render letterboxed.
await page1.goto('about:blank');
await page1.waitForTimeout(900);
await page1.setContent(card('Your first big customer just sent a security questionnaire.', 'Now what?'));
await page1.waitForTimeout(3000);
await page1.setContent(card('Meet Groundwork.', 'A tailored security plan for your startup, free, in 5 minutes.', '#3ecf8e'));
await page1.waitForTimeout(2700);

await page1.goto(APP);
await page1.waitForSelector('.landing-hero');
await page1.waitForTimeout(1600);
await moveClick(page1, page1.locator('text=Build my security plan'));
await page1.waitForSelector('.wizard');
await page1.waitForTimeout(500);

await page1.locator('input[type=text]').click();
await page1.keyboard.type('VetSched', { delay: 70 });
await page1.waitForTimeout(300);
await page1.locator('textarea').click();
await page1.keyboard.type('Scheduling software for veterinary clinics.', { delay: 28 });
await page1.waitForTimeout(300);
await moveClick(page1, page1.locator('button:has-text("2–10 people")'));
await moveClick(page1, page1.locator('button:has-text("Launched")'));
await page1.waitForTimeout(350);
await moveClick(page1, page1.locator('button:has-text("Continue")'));

// Step 2: product & data
await moveClick(page1, page1.locator('button:has-text("Web app / SaaS")'));
await moveClick(page1, page1.locator('button:has-text("Personal data")'));
await moveClick(page1, page1.locator('button:has-text("Payment / card data")'));
await page1.waitForTimeout(300);
await moveClick(page1, page1.locator('button:has-text("Continue")'));

// Step 3: systems
await moveClick(page1, page1.locator('button:has-text("Azure")'));
await moveClick(page1, page1.locator('.choice-grid button:has-text("GitHub")'));
await page1.waitForTimeout(300);
await moveClick(page1, page1.locator('button:has-text("Continue")'));

// Step 4: team
await moveClick(page1, page1.locator('button:has-text("Fully remote")'));
await page1.waitForTimeout(250);
await moveClick(page1, page1.locator('button:has-text("Continue")'));

// Step 5: customers & compliance
await moveClick(page1, page1.locator('button:has-text("Businesses (B2B)")'));
await moveClick(page1, page1.locator('button:has-text("Large enterprises")'));
await moveClick(page1, page1.locator('.choice-grid button:has-text("SOC 2")'));
await page1.waitForTimeout(300);
await moveClick(page1, page1.locator('button:has-text("Continue")'));

// Step 6: existing measures, generate
await moveClick(page1, page1.locator('button:has-text("MFA on important accounts")'));
await moveClick(page1, page1.locator('button:has-text("Team password manager")'));
await page1.waitForTimeout(400);
await moveClick(page1, page1.locator('button:has-text("Generate my plan")'));
await page1.waitForSelector('.dashboard');
await page1.waitForTimeout(2400);

// Scroll through the plan, open one control.
await page1.evaluate(() => window.scrollTo({ top: 500, behavior: 'smooth' }));
await page1.waitForTimeout(1500);
await moveClick(page1, page1.locator('.item-title').nth(3));
await page1.waitForTimeout(2600);
await page1.close();

// ── Segment 2: Pro report (signed-in, entitled) + end card ──
const page2 = await context.newPage();
await page2.route('**/.auth/me', (r) =>
  r.fulfill({ json: { clientPrincipal: { userId: 'u1', userDetails: 'founder@vetsched.com', identityProvider: 'aad' } } }),
);
await page2.route('**/api/me', (r) =>
  r.fulfill({ json: { userId: 'u1', userDetails: 'founder@vetsched.com', pro: true } }),
);
await page2.route('**/api/state', (r) =>
  r.request().method() === 'GET' ? r.fulfill({ json: { state: savedState } }) : r.fulfill({ status: 204 }),
);
await page2.goto(APP);
await page2.waitForSelector('.dashboard');
await page2.waitForTimeout(900);
await moveClick(page2, page2.locator('button:has-text("Security report")'));
await page2.waitForSelector('.report');
await page2.waitForTimeout(1900);
await page2.evaluate(() => window.scrollTo({ top: 620, behavior: 'smooth' }));
await page2.waitForTimeout(1900);

await page2.setContent(card('Get your free security plan today.', 'groundwork-security.com', '#3ecf8e'));
await page2.waitForTimeout(3400);
await page2.close();

await context.close();
await browser.close();

// ── Stitch segments with ffmpeg ──
const ffmpeg =
  process.env.FFMPEG_PATH ||
  execFileSync('python3', ['-c', 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'])
    .toString()
    .trim();

const webms = fs
  .readdirSync(workDir)
  .filter((f) => f.endsWith('.webm'))
  .map((f) => path.join(workDir, f))
  .sort((a, b) => fs.statSync(a).birthtimeMs - fs.statSync(b).birthtimeMs);

const mp4s = webms.map((w, i) => {
  const out = path.join(workDir, `seg${i}.mp4`);
  execFileSync(ffmpeg, [
    '-y', '-i', w,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '21',
    '-pix_fmt', 'yuv420p', '-r', '30', '-an', out,
  ]);
  return out;
});

const listFile = path.join(workDir, 'list.txt');
fs.writeFileSync(listFile, mp4s.map((m) => `file '${m}'`).join('\n'));
const finalOut = path.join(here, 'demo.mp4');
execFileSync(ffmpeg, ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', '-movflags', '+faststart', finalOut]);

console.log('wrote', finalOut, `(${(fs.statSync(finalOut).size / 1e6).toFixed(1)} MB, ${webms.length} segments)`);
fs.rmSync(workDir, { recursive: true, force: true });

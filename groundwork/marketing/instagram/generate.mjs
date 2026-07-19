// Renders the Instagram artboards (avatar, posts, reel background) to PNGs.
// Usage from groundwork/: node marketing/instagram/generate.mjs
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
});
const page = await browser.newPage({ viewport: { width: 1200, height: 2000 } });

await page.goto('file://' + path.join(here, 'assets.html'));
await page.waitForTimeout(300);
for (const [id, out] of [
  ['avatar', 'avatar-1080.png'],
  ['hook', 'post-hook-1080.png'],
  ['moment', 'post-questionnaire-1080.png'],
  ['tip', 'post-tips-1080.png'],
  ['tip-cloud', 'post-cloud-1080.png'],
  ['tip-backups', 'post-backups-1080.png'],
  ['tip-bec', 'post-bec-1080.png'],
  ['tip-github', 'post-github-1080.png'],
  ['tip-incident', 'post-incident-1080.png'],
  ['tip-vendors', 'post-vendors-1080.png'],
  ['tip-secrets', 'post-secrets-1080.png'],
  ['tip-soc2', 'post-soc2-1080.png'],
]) {
  await page.locator(`#${id}`).screenshot({ path: path.join(here, out) });
  console.log('wrote', out);
}

await page.goto('file://' + path.join(here, 'reel-frame.html'));
await page.waitForTimeout(300);
await page.locator('#frame').screenshot({ path: path.join(here, 'reel-frame-1080x1920.png') });
console.log('wrote reel-frame-1080x1920.png');

await browser.close();

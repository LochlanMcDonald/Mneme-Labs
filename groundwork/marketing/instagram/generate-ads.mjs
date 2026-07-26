// Renders the paid ad creatives to 1080x1350 PNGs (Instagram's tallest feed
// ratio, so each ad occupies the most screen it is allowed).
// Usage from groundwork/: node marketing/instagram/generate-ads.mjs
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
});
const page = await browser.newPage({ viewport: { width: 1200, height: 1500 } });
await page.goto('file://' + path.join(here, 'ads.html'));
await page.waitForTimeout(400);

for (const [id, out] of [
  ['ad-questions', 'ad-questionnaire-1080x1350.png'],
  ['ad-beforeafter', 'ad-before-after-1080x1350.png'],
  ['ad-number', 'ad-56-controls-1080x1350.png'],
  ['ad-product', 'ad-product-1080x1350.png'],
  ['ad-noteam', 'ad-no-security-team-1080x1350.png'],
  ['ad-frameworks', 'ad-frameworks-1080x1350.png'],
]) {
  await page.locator(`#${id}`).screenshot({ path: path.join(here, out) });
  console.log('wrote', out);
}

await browser.close();

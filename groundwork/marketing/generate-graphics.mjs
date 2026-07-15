// Renders marketing/graphics.html artboards to PNGs at exact pixel sizes.
// Usage: node marketing/generate-graphics.mjs   (from the groundwork/ dir,
// with playwright-core installed and PLAYWRIGHT chromium available)
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

const TARGETS = [
  { id: 'og', out: path.join(here, '..', 'public', 'og.png') },
  { id: 'hero', out: path.join(here, 'hero-1270x760.png') },
  { id: 'square', out: path.join(here, 'ad-square-1080.png') },
];

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
});
const page = await browser.newPage({ viewport: { width: 1400, height: 1200 }, deviceScaleFactor: 1 });
await page.goto('file://' + path.join(here, 'graphics.html'));
await page.waitForTimeout(300);

for (const target of TARGETS) {
  const el = page.locator(`#${target.id}`);
  await el.screenshot({ path: target.out });
  console.log('wrote', target.out);
}

await browser.close();

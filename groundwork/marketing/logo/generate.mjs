// Renders the logo concept sheet (and, once a direction is chosen, the
// exported mark set) to PNGs. Usage from groundwork/:
//   node marketing/logo/generate.mjs
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
});
const page = await browser.newPage({ viewport: { width: 1760, height: 2200 }, deviceScaleFactor: 2 });

await page.goto('file://' + path.join(here, 'concepts.html'));
await page.waitForTimeout(300);
await page.locator('#sheet').screenshot({ path: path.join(here, 'concepts.png') });
console.log('wrote concepts.png');

// Finalized brand sheet for the chosen direction (Concept A).
await page.goto('file://' + path.join(here, 'final.html'));
await page.waitForTimeout(300);
await page.locator('#sheet').screenshot({ path: path.join(here, 'brand-sheet.png') });
console.log('wrote brand-sheet.png');

// 1080x1080 social avatar (mark on the brand gradient).
await page.goto('file://' + path.join(here, 'avatar.html'));
await page.waitForTimeout(300);
await page.locator('#avatar').screenshot({ path: path.join(here, 'avatar-1080.png') });
console.log('wrote avatar-1080.png');

// Flat app-icon PNG at 512 (no rounded corners; platforms mask it).
await page.setViewportSize({ width: 512, height: 512 });
await page.setContent(
  `<div style="width:512px;height:512px;background:#0c111b;display:flex;align-items:center;justify-content:center">
     <svg width="512" height="512" viewBox="0 0 100 100">
       <rect x="39" y="20" width="22" height="15" rx="7" fill="#3ecf8e"/>
       <rect x="29" y="42.5" width="42" height="15" rx="7" fill="#7fa8ff"/>
       <rect x="15" y="65" width="70" height="16" rx="8" fill="#4f8cff"/>
     </svg></div>`,
);
await page.waitForTimeout(150);
await page.screenshot({ path: path.join(here, 'app-icon-512.png') });
console.log('wrote app-icon-512.png');

await browser.close();

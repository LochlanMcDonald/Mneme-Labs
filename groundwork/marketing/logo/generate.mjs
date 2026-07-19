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
       <polygon points="44,22 62,31 44,40 26,31" fill="#7df3ff"/>
       <polygon points="26,31 44,40 44,47 26,38" fill="#22d3ee"/>
       <polygon points="62,31 44,40 44,47 62,38" fill="#0e7490"/>
       <polygon points="56,38 74,47 56,56 38,47" fill="#9ad4ff"/>
       <polygon points="38,47 56,56 56,63 38,54" fill="#4f8cff"/>
       <polygon points="74,47 56,56 56,63 74,54" fill="#3b5bdb"/>
       <polygon points="44,54 62,63 44,72 26,63" fill="#d3b0ff"/>
       <polygon points="26,63 44,72 44,79 26,70" fill="#a855f7"/>
       <polygon points="62,63 44,72 44,79 62,70" fill="#7c3aed"/>
     </svg></div>`,
);
await page.waitForTimeout(150);
await page.screenshot({ path: path.join(here, 'app-icon-512.png') });
console.log('wrote app-icon-512.png');

await browser.close();

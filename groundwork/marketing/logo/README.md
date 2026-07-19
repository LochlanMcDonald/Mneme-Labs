# Groundwork logo

The Groundwork mark is three offset slabs stacked into a foundation, drawn
isometrically so it reads as a dimensional structure. The palette climbs from
a violet base through blue to a cyan top course, giving it a modern, technical
feel while still telling the "building your foundation" story.

## The mark lives in code

The single source of truth for the in-product mark is the React component
`src/components/BrandMark.tsx`. Every place the wordmark appears (landing,
dashboard, help, report) renders that component, and the browser-tab favicon
in `index.html` is the same geometry as an inline SVG data URI. Change the
component and the favicon together to reskin the whole app.

## Colors

Each slab is drawn with three faces (top, left, right) to fake the isometric
lighting.

| Slab | Top | Left | Right |
| --- | --- | --- | --- |
| Top (cyan) | `#7df3ff` | `#22d3ee` | `#0e7490` |
| Middle (blue) | `#9ad4ff` | `#4f8cff` | `#3b5bdb` |
| Base (violet) | `#d3b0ff` | `#a855f7` | `#7c3aed` |

App-icon background is `#0c111b`. On light backgrounds, use the single-hue
blue version (`mark-mono-blue.svg`); on dark or photographic backgrounds, use
the white version (`mark-mono-light.svg`).

## Files

| File | Use |
| --- | --- |
| `mark.svg` | Primary full-color mark (transparent) |
| `mark-badge.svg` | Mark on a rounded dark square (app-icon lockup) |
| `mark-mono-blue.svg` | Single-hue blue 3D, for light backgrounds |
| `mark-mono-light.svg` | White 3D, for dark/photographic backgrounds |
| `app-icon-512.png` | 512px flat app icon (platforms apply their own corner mask) |
| `avatar-1080.png` | 1080×1080 social profile avatar (mark on brand gradient) |
| `brand-sheet.png` | The finalized one-page brand sheet |
| `concepts.png` / `concepts2.png` | Flat directions explored (batch 1 and 2) |
| `g5-explore.png` | The G5 color and form study |
| `cyber.png` / `cyber2.png` | The cyber / 3D explorations (Y4 was chosen here) |

## Regenerating

```bash
cd groundwork && npm install --no-save playwright-core
node marketing/logo/generate.mjs
```

Edit the artboards (`final.html`, `avatar.html`) and re-run.

## Switching direction

The mark is centralized in `BrandMark.tsx`, the favicon data URI in
`index.html`, and the artboard SVGs. Because it is nine polygons in one
component, swapping to a different explored direction is a contained change.

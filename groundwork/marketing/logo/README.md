# Groundwork logo

The Groundwork mark is three stacked courses building up from a wide base:
the "foundation" the brand is named for. It is built entirely from the brand
palette and is intentionally simple so it stays legible down to a 16px
browser-tab favicon.

## The mark lives in code

The single source of truth for the in-product mark is the React component
`src/components/BrandMark.tsx`. Every place the wordmark appears (landing,
dashboard, help, report) renders that component, and the browser-tab favicon
in `index.html` is the same geometry as an inline SVG data URI. Change the
component and the favicon together to reskin the whole app.

## Colors

| Token | Hex | Used for |
| --- | --- | --- |
| Green | `#3ecf8e` | Top course |
| Blue (light) | `#7fa8ff` | Middle course |
| Blue | `#4f8cff` | Base course |
| Base dark | `#0c111b` | App-icon background |

On light backgrounds the two blues drop to `#1f57c9` for contrast; on the
brand blue the whole mark reverses to white.

## Files

| File | Use |
| --- | --- |
| `mark.svg` | Primary full-color mark (transparent) |
| `mark-badge.svg` | Mark on a rounded dark square (app-icon lockup) |
| `mark-mono-light.svg` | White single-color mark, for dark/photographic backgrounds |
| `mark-mono-dark.svg` | Near-black single-color mark, for light backgrounds |
| `app-icon-512.png` | 512px flat app icon (platforms apply their own corner mask) |
| `avatar-1080.png` | 1080×1080 social profile avatar (mark on brand gradient) |
| `brand-sheet.png` | The finalized one-page brand sheet |
| `concepts.png` | The six explored directions (A–F), kept for reference |

## Regenerating

```bash
cd groundwork && npm install --no-save playwright-core
node marketing/logo/generate.mjs
```

Edit the artboards (`final.html`, `avatar.html`, `concepts.html`) and re-run.

## Switching direction

Concept A ("Foundation") is the chosen mark. The other five explored
directions still live in `concepts.html`. To adopt a different one, swap the
three `<rect>` shapes in `BrandMark.tsx`, the favicon data URI in
`index.html`, and the SVG in the artboards, then regenerate. Because the mark
is centralized in one component, it is a small change.

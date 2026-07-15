# Marketing assets

Generated, brand-consistent assets for launches, ads, and social.

| Asset | Size | Use |
| --- | --- | --- |
| `../public/og.png` | 1200×630 | Social share card, served at `/og.png` and wired into the site's Open Graph and Twitter meta tags |
| `hero-1270x760.png` | 1270×760 | Product Hunt gallery, blog headers |
| `ad-square-1080.png` | 1080×1080 | LinkedIn, Instagram, X square ad creative |
| `demo.mp4` | 1280×720, ~48s, silent | Product demo: hook card, wizard walkthrough, plan reveal, Pro report, CTA card. Works for Product Hunt, LinkedIn, X, landing pages |

## Regenerating

Graphics are artboards in `graphics.html`, rendered to PNG at exact sizes:

```bash
cd groundwork && npm install --no-save playwright-core
node marketing/generate-graphics.mjs
```

The video is scripted against the real app (with the account API mocked
for the Pro report scene) and stitched with ffmpeg:

```bash
npm run build && npx vite preview --port 4173 &
node marketing/make-video.mjs   # needs FFMPEG_PATH or python3 imageio-ffmpeg
```

Edit the copy in `graphics.html` / the `card()` calls in `make-video.mjs`
and re-run; everything else stays consistent automatically.

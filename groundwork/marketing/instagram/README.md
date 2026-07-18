# Instagram starter kit

Brand-consistent assets for the @groundwork Instagram account, generated
from the same design system as the site and the rest of the marketing kit.

## Files

| File | Size | Use |
| --- | --- | --- |
| `avatar-1080.png` | 1080×1080 | Profile picture (mark only, survives IG's circle crop) |
| `reel-9x16.mp4` | 1080×1920, ~48s | Reel / Story: the product demo in a branded vertical frame |
| `post-hook-1080.png` | 1080×1080 | Feed post: main value prop |
| `post-questionnaire-1080.png` | 1080×1080 | Feed post: the "security questionnaire" trigger moment |
| `post-tips-1080.png` | 1080×1080 | Feed post: a value tip (4 quick wins) |

## Profile setup

- **Name:** Groundwork
- **Username:** `groundworksecurity` (or the closest available; keep it as
  close to the domain as possible for trust and discoverability)
- **Category:** switch to a Professional / Business account (Settings →
  Account type). Free, and it unlocks insights + the ability to run ads
  later.
- **Website / link in bio:** `https://groundwork-security.com`
- **Profile picture:** `avatar-1080.png`

### Bio (150-char limit)

> Startup security, sorted. Get a free, tailored security plan in 5 minutes.
> No expertise needed. 👇

(Shorter alt: `Free, tailored security plans for startups. 5 minutes, no expertise needed. 👇`)

## Captions

**Reel (`reel-9x16.mp4`):**
> Your first enterprise customer asks for your security posture. Your
> insurer wants a questionnaire filled out. An investor asks what you do
> about data protection. 😅
>
> Groundwork gives you a tailored security plan in 5 minutes — free. It
> learns what you build and what you run, then tells you exactly what to
> do this week, this month, and this quarter, in plain English.
>
> Start yours free 👉 groundwork-security.com
>
> #startup #cybersecurity #founders #saas #infosec #soc2 #startuptips
> #techstartup #datasecurity #buildinpublic

**Hook post (`post-hook-1080.png`):**
> Security shouldn't be the thing you'll "get to eventually." Answer a few
> questions, get a prioritized plan you can actually work through. Free.
> Link in bio.
>
> #startup #cybersecurity #founders #saas #startuptips #infosec

**Questionnaire post (`post-questionnaire-1080.png`):**
> That first enterprise deal often comes with a security questionnaire
> attached. Groundwork gets you ready — and gives you the answers. Free.
> Link in bio.
>
> #startup #soc2 #b2bsaas #cybersecurity #founders #salesenablement

**Tips post (`post-tips-1080.png`):**
> Four things that stop the majority of startup breaches, and you can do
> all of them this week. Want the plan tailored to YOUR stack? It's free.
> Link in bio.
>
> #cybersecurity #startuptips #infosec #founders #mfa #databreach

## Regenerating

```bash
cd groundwork && npm install --no-save playwright-core
node marketing/instagram/generate.mjs   # avatar + posts + reel frame
node marketing/instagram/make-reel.mjs   # composes reel-9x16.mp4 from demo.mp4
```

Edit copy in `assets.html` / `reel-frame.html` and re-run.

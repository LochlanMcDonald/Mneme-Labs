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
| `post-cloud-1080.png` | 1080×1080 | Feed post: locking down the cloud root/IAM |
| `post-backups-1080.png` | 1080×1080 | Feed post: ransomware-proof backups |
| `post-bec-1080.png` | 1080×1080 | Feed post: wire fraud / business email compromise |
| `post-github-1080.png` | 1080×1080 | Feed post: free GitHub security settings |
| `post-incident-1080.png` | 1080×1080 | Feed post: writing an incident response plan |
| `post-vendors-1080.png` | 1080×1080 | Feed post: SaaS / vendor inventory (shadow IT) |
| `post-secrets-1080.png` | 1080×1080 | Feed post: getting secrets out of code |
| `post-soc2-1080.png` | 1080×1080 | Feed post: starting SOC 2 readiness early |

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
> Groundwork gives you a tailored security plan in 5 minutes, free. It
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
> attached. Groundwork gets you ready and gives you the answers. Free.
> Link in bio.
>
> #startup #soc2 #b2bsaas #cybersecurity #founders #salesenablement

**Tips post (`post-tips-1080.png`):**
> Four things that stop the majority of startup breaches, and you can do
> all of them this week. Want the plan tailored to YOUR stack? It's free.
> Link in bio.
>
> #cybersecurity #startuptips #infosec #founders #mfa #databreach

### Content queue (post ~2x/week)

**Cloud lockdown (`post-cloud-1080.png`):**
> One leaked cloud key can delete your production data AND your backups.
> Lock down the root account, kill root API keys, and put people on SSO
> roles instead of long-lived keys. Groundwork tailors the rest to your
> stack, free. Link in bio.
>
> #cloudsecurity #aws #devops #startup #infosec #cybersecurity

**Backups / ransomware (`post-backups-1080.png`):**
> Ransomware, a bad migration, or one wrong DELETE can end a startup with
> no restorable backups. You can fix this in an afternoon. The untested
> backup is the one that fails, so restore one this quarter. Free plan in
> bio.
>
> #ransomware #backups #startup #cybersecurity #datasecurity #founders

**Wire fraud / BEC (`post-bec-1080.png`):**
> Business email compromise steals more from small companies than any
> malware does. The "updated bank details" email is the whole scam.
> Verify every payment change out-of-band and brief whoever pays the
> invoices. Free plan in bio.
>
> #wirefraud #bec #startup #founders #cybersecurity #fraudprevention

**GitHub settings (`post-github-1080.png`):**
> Four free GitHub settings that stop most code-level incidents:
> Dependabot, secret scanning with push protection, branch protection,
> and required reviews. Turn them on this week. Full tailored plan free.
> Link in bio.
>
> #github #devsecops #appsec #startup #cybersecurity #buildinpublic

**Incident plan (`post-incident-1080.png`):**
> In a real incident you'll be stressed and improvising. A one-page plan
> written on a calm day beats a great plan you never wrote. Define an
> incident, name who's in charge, list the first moves. Free plan in bio.
>
> #incidentresponse #cybersecurity #startup #infosec #founders #soc2

**Vendor / shadow IT (`post-vendors-1080.png`):**
> Your security is only as good as that forgotten SaaS tool holding
> customer data with no MFA. Mine your receipts and SSO logs, list every
> tool, cancel what you don't use. Groundwork builds the rest, free. Link
> in bio.
>
> #shadowit #saas #vendorrisk #startup #cybersecurity #infosec

**Secrets in code (`post-secrets-1080.png`):**
> API keys in your repo get harvested by bots within minutes. Move
> secrets to a secret manager, gitignore your .env, and rotate anything
> ever committed (assume it's burned). Free tailored plan in bio.
>
> #devsecops #appsec #secrets #startup #cybersecurity #coding

**SOC 2 readiness (`post-soc2-1080.png`):**
> Enterprise buyers use SOC 2 as a gate. Starting readiness early is far
> cheaper than a panicked pre-deal scramble. Finish the basics, pick a
> compliance platform, aim for Type I first. Groundwork gets you started,
> free. Link in bio.
>
> #soc2 #compliance #b2bsaas #startup #cybersecurity #founders

## Regenerating

```bash
cd groundwork && npm install --no-save playwright-core
node marketing/instagram/generate.mjs   # avatar + posts + reel frame
node marketing/instagram/make-reel.mjs   # composes reel-9x16.mp4 from demo.mp4
```

Edit copy in `assets.html` / `reel-frame.html` and re-run.

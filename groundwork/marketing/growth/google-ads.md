# Groundwork: Google Search Ads setup

High-intent search is the fastest non-Meta channel: people literally search
"SOC 2 for startups" and "how to answer a security questionnaire." No platform
approval needed, and you can be live this week.

## Before you launch: conversion tracking

Do this first, or you are flying blind and cannot use smart bidding.

1. Create a **Google Ads** account and a **GA4** property for
   groundwork-security.com (if not already).
2. Define the primary conversion: **"Plan generated"** (user reaches the
   dashboard) or **"Account created"**. A secondary conversion can be
   **"Pro upgrade"**.
3. Either fire a GA4 event on those actions and import it into Google Ads, or
   drop the Google Ads conversion tag and trigger it on the same events.
4. Verify conversions register before scaling spend.

## Campaign structure

- **Campaign type:** Search only (no Display/Search Partners to start).
- **Geo:** the markets you can actually serve (start narrow, e.g. US, or
  US + UK + Canada + Australia). English.
- **Budget:** start at **$20/day**. Bidding: **Maximize Clicks** with a max
  CPC cap of ~$3 for the first ~2 weeks to gather data, then switch to
  **Maximize Conversions** (or tCPA) once you have ~15-30 conversions.
- **Ad rotation:** optimize. **Networks:** Search only.

Split into four ad groups by intent theme so ad copy matches the search.

### Ad group 1: Security questionnaires (highest intent)

Keywords (phrase + exact):
- "security questionnaire help"
- "how to answer a security questionnaire"
- "vendor security questionnaire"
- "customer security questionnaire startup"
- "security questionnaire for saas"

### Ad group 2: SOC 2 for startups

- "soc 2 for startups"
- "soc 2 readiness"
- "how to get soc 2 compliant"
- "soc 2 checklist"
- "soc 2 startup cost"

### Ad group 3: Startup security (getting started)

- "startup cybersecurity"
- "security for startups"
- "startup security checklist"
- "security plan for startup"
- "how to secure a startup"

### Ad group 4: Enterprise deal readiness

- "security requirements for enterprise customers"
- "security for b2b saas"
- "infosec for startups"
- "pass a vendor security review"

### Shared negative keywords (add at campaign level)

`jobs`, `job`, `salary`, `course`, `courses`, `certification`, `certificate`,
`training`, `exam`, `resume`, `analyst`, `degree`, `bootcamp`, `internship`,
`freelance`, `template free download`, `open source`

## Ad copy (Responsive Search Ads)

Headlines are max 30 chars, descriptions max 90. Give Google 12-15 headlines
and 4 descriptions per ad group; it assembles the best combos. Pin 1-2 brand
headlines to position 1 if you want consistency.

### Headlines (mix and match; keep 12+ live)

- Startup Security, Sorted
- Free Security Plan, 5 Min
- SOC 2 Readiness for Startups
- Answer Security Questionnaires
- Security Plan in 5 Minutes
- No Security Team Needed
- Tailored to Your Stack
- Pass Vendor Security Reviews
- Prioritized, Plain Language
- Close Your Enterprise Deal
- Free Startup Security Plan
- Security Without the Hassle
- Week, Month, Quarter Plan
- Get Audit-Ready Faster
- Built for Founders

### Descriptions (max 90 chars each)

- Answer a few questions. Get a prioritized, plain language security roadmap. Free.
- A tailored security plan for your startup in 5 minutes. No expertise needed.
- Get ready for SOC 2 and customer security questionnaires. Start free today.
- Know what to do this week, this month, this quarter, and why. Free to start.

Per-ad-group tweaks: lead ad group 1 headlines with "Answer Security
Questionnaires"; ad group 2 with "SOC 2 Readiness for Startups"; ad group 4
with "Close Your Enterprise Deal."

## Assets / extensions (add all: they lift CTR for free)

- **Sitelinks:** How It Works · Free Security Plan · SOC 2 Readiness ·
  Security Questionnaires
- **Callouts:** Free plan · 5-minute setup · No security team needed ·
  Tailored to your stack · Plain language steps
- **Structured snippet** (Services): Security roadmap, SOC 2 prep,
  Questionnaire answers, Advisor access, Audit-ready reports
- **Final URL:** https://groundwork-security.com/ (the landing already matches
  the message: "Startup security, sorted" + free plan CTA)

## First two weeks

1. Launch all four ad groups at $20/day, Maximize Clicks, CPC cap $3.
2. Check the **Search Terms report** every 2-3 days; add junk terms as
   negatives, promote good terms to exact match.
3. Pause headlines/keywords with high spend and zero conversions.
4. Once ~15-30 conversions land, switch to Maximize Conversions and raise
   budget on the ad groups with the lowest cost per plan generated.

Expect the questionnaire and SOC 2 ad groups to convert best: they are the
"I have a problem right now" searches.

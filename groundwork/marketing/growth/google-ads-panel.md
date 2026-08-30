# Google Ads: Groundwork Panel campaign

A separate Search campaign for Panel, not an ad group inside the existing
one. The existing campaign optimizes toward the "Plan generated"
conversion; Panel clicks do not produce that conversion, so mixing them
would starve Panel ads. Every asset below is within Google's character
limits (verified).

## Campaign settings

- Type: **Search** (decline Performance Max / Display expansion / search
  partners if offered)
- Name: `Panel - Search`
- Budget: **$10/day** to start
- Bidding: **Maximize clicks** with a **max CPC limit of $3.00** (no Panel
  purchase conversion exists yet to optimize toward; revisit when one does)
- Locations: United States and Canada, "presence" (people in the location)
- Languages: English
- Final URL everywhere: `https://groundwork-security.com/#/panel`

## Ad group: console fatigue

Keywords (phrase match), aimed at the pain, not the category:

- "security alert dashboard"
- "manage multiple security tools"
- "single pane of glass security"
- "security console aggregator"
- "too many security tools"
- "multi vendor security dashboard"
- "all security alerts in one place"
- "microsoft sentinel dashboard"
- "defender and sentinel dashboard"

Negative keywords (campaign level):

- job, jobs, salary, career, hiring
- course, training, certification, tutorial
- free, open source
- template, excel, power bi, grafana
- siem (SIEM buyers want ingestion and correlation; Panel is not that)

## Responsive search ad

Headlines (30 max), add all of them and pin nothing:

| Headline | Chars |
| --- | --- |
| Every Console. One Glance. | 26 |
| One Dashboard, Every Alert | 26 |
| Stop Juggling Six Consoles | 26 |
| Watch Defender & Sentinel | 25 |
| CrowdStrike, Sentinel & More | 28 |
| Your Keys Stay Local | 20 |
| Alert Counts At A Glance | 24 |
| Desktop App, Mac & Windows | 26 |
| $14.99/mo, Cancel Anytime | 25 |
| Too Many Security Tools? | 24 |
| Groundwork Panel | 16 |
| One Click To Any Console | 24 |

Descriptions (90 max):

| Description | Chars |
| --- | --- |
| New alerts from Defender, Sentinel, CrowdStrike, Proofpoint, Workspace and GitHub. | 82 |
| Every security console on one board. One click opens the right one. Keys stay local. | 84 |
| A desktop dashboard for your security tools. See what is new without opening six tabs. | 86 |
| Try it with demo data first. $14.99 a month, cancel anytime. Mac and Windows. | 77 |

## Assets (extensions)

Sitelinks:

| Text | Line 1 | Line 2 | URL |
| --- | --- | --- | --- |
| What's covered | 56 security controls, 9 areas | Mapped to SOC 2, ISO 27001, GDPR | /#/coverage |
| Get a free plan | Answer a few quick questions | A prioritized security plan, free | / |
| Help & FAQs | Incident playbooks included | Know what to do when it goes wrong | /#/help |
| About Groundwork | Enterprise security background | Advice that fits real companies | /#/about |

Callouts: Keys stay local · Mac and Windows · Cancel anytime ·
6 consoles supported · Demo mode included

Structured snippet, header "Types": Microsoft Defender, Microsoft
Sentinel, CrowdStrike Falcon, Proofpoint TRAP, Google Workspace, GitHub.

## Rules of honesty

- Never use "monitoring", "24/7", "real-time", or "SOC" in ad copy; Panel
  polls on a refresh cycle and nobody is awake at 3am.
- Price appears in the ads on purpose: it pre-filters clicks so the budget
  pays only for people who saw $14.99 and still wanted it.

## Later

- Add a Panel purchase conversion (fires when a subscription unlocks the
  downloads) and switch bidding to Maximize conversions once it has 15+.
- If "sentinel dashboard" terms get expensive, split Microsoft-flavored
  keywords into their own ad group with Defender/Sentinel-led headlines.

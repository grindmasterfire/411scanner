# 411 Scanner

AI forensic engine that investigates suspicious messages, ads, websites, and offers — and returns a plain-language report with a risk score. Android client, Firebase backend, Gemini-powered research pipeline.

## Architecture

```
app/            Android client (Kotlin + Jetpack Compose)
functions/      Firebase Cloud Functions (Node.js, v2)
  index.js            Callable endpoints: scan, deepDive, grantEntitlement, ...
  scanWorkflow.js     Orchestrates the research pipeline
  geminiEngine.js     Gemini 3.x passes (OSINT extraction → JSON ledger)
  entitlementStore.js Per-user scan buckets: tier schedule, top-ups, family
  scanErrorCodes.js   Canonical 5-digit failure taxonomy (users never see HTTP codes)
  businessCenterReport.js  Live operational reporting (never pulls prod)
```

**Pipeline:** screenshot/photo in → Pass 1 OSINT extraction with live Google grounding → Pass 2 strict JSON ledger → scored report out. Repeat investigations are served from the Cache Bank.

**Every scan costs 1 credit.** Subscription credits reset each billing period; top-up credits carry over forever and are spent last.

## Plans (locked)

| Tier | Price | Scans |
|------|-------|-------|
| Free | $0 (1/week, ad-gated) | 1/week |
| Rental | $3.99 / 7 days | 7 |
| Standard | $12.99/mo · $129.99/yr | 30 / 360 |
| Pro | $24.99/mo · $249.99/yr | 60 / 720 |
| Family | $19.99/mo · $199.99/yr | 40 / 480 shared (4 seats) |

Top-ups (subscribers only, never expire): 5/$2.99 · 10/$4.99 · 20/$8.99 · Family 25/$10.99

## Setup

Prerequisites: Node 20+, Android Studio (Koala+), a Firebase project, a Google Play developer account.

```bash
# Backend
cd functions
npm install
cp .env.example .env        # fill in runtime keys (never commit .env)

# Android
# Place google-services.json in app/ (never commit it)
# Open in Android Studio and build
```

Secrets (`.env`, `app/google-services.json`, `local.properties`, keystores) are git-ignored. See `.env.example` for required keys.

## Key docs

- **User Manual** — for end users (plans, scores, error codes). Published separately.
- **Terms of Service / Privacy Statement / Legal Statement** — published separately (Privacy URL goes in Play Console).

## Failure codes

Users see a **5-digit code** plus a plain-language sentence — never raw HTTP statuses. The canonical table lives in `functions/scanErrorCodes.js` (mirrored in `ScanErrorCodes.kt`). HTTP codes are recorded on receipts and reported in the Business Center only.

## Operator commands (Business Center)

Read-only reporting against live production data. Never invokes Gemini, never mutates anything, never pulls the scanner down. Run from `functions/` with Firebase credentials available.

```bash
# Business Center aggregate reports (periods are UTC)
node scripts/business-center.js last    # most recent receipts
node scripts/business-center.js today   # today's receipts
node scripts/business-center.js week    # this week's receipts
node scripts/business-center.js month   # this month's receipts

# Field-health snapshot (this week: requests, modes, costs, failures by code)
node scripts/health.js

# QA the most recent scan receipts (default 10)
node scripts/qa-last.js [n]

# Revenue ledger (needs grant events; profit line joins revenue + AI cost)
node scripts/business-center.js revenue [today|week|month]

# Week-over-week trend (volume, money, reliability deltas)
node scripts/business-center.js trend
```

Reports include request modes, AI usage, research costs, cache performance, and failures broken down by 5-digit code — each with a plain-language explanation.

## Contributing

This is a solo-build repo. Issues and PRs are welcome but may be triaged slowly.

## License

All rights reserved © cipherworks Dev Cottage.

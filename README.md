# 411 Scanner

AI forensic engine that investigates suspicious ads, messages, emails, flyers, websites, and offers, and returns a plain-language report: a score, an action, the Technical 411 evidence ledger, and alternatives. Android client, Firebase backend, Gemini research pipeline with live Google Search grounding.

> **The Business Center is the place we go for answers. If there isn't a container catching the information that might be requested, we build it now.** (fire)
>
> **If it turns, moves, dings, blinks, flows, or is stationary inside the app, it gets a script to test it and a command to pull the report.** (fire)

## Architecture

```
app/                          Android client (Kotlin + Jetpack Compose)
  ScanWorker.kt               background scans (WorkManager), follow by request ID
  DeepDiveWorker.kt           background Deep Dives, same safe-resend contract
functions/                    Firebase Cloud Functions (Node.js 22, v2)
  index.js                    callables: scan, deepDive, getScanResult, grantEntitlement, family*, admobSsv
  scanWorkflow.js             scan pipeline: gate → research → governance → delivery
  geminiEngine.js             Pass 1A search-first, 1B dossier, 2 JSON ledger
  prompt.js                   scoring prompt (the evaluation)
  actionMeter*.js             server-owned score: 7.9 model cap, 8.0 boundary, floor raisers
  networkProbe.js             Network Probe: DNS, TLS, ASN, MX, DMARC/SPF, tracking IDs, RDAP
  registryLedger.js           registry values into the ledger; no status code ever ships as a value
  technicalLedgerEvidence.js  evidence rows: grounded sources, independence, reasons
  requiredInfrastructure.js   exceptions list (config/requiredInfrastructure.json) + watchlist.js
  redTeamGuards.js            attack view, "The attack asked:", text pre-scan, regulatory cap, attack floor
  reportDestinations.js       Report button doors by violation type
  deepDive*.js                Deep Dive: finding, engine, cache, background requests
  incidentLedger.js           Incident Ledger: every scan's specimen, calls, and report
  scanErrorCodes.js           5-digit failure codes (mirrored in ScanErrorCodes.kt)
  scripts/                    Business Center and operator tools (local only, never deployed)
docs/                         user manual, terms, privacy, legal (GitHub Pages)
```

**Scan pipeline:** specimen in → gate (credits, ad, family) → Cache Bank lookup → Network Probe on the specimen's links → Pass 1A search-first (grounding gate) → Pass 1B research dossier → Pass 2 JSON ledger → server governance (registry values, impersonation guard, floor raisers, attack floor, regulatory cap) → scored report → delivery (exceptions, verdict relabel, code scrub, report doors, attack view) → Incident Ledger.

**Every confirmed scan uses 1 credit.** Plan scans reset each period; top-ups carry over forever and are spent last; Deep Dives use top-ups only.

## Plans (locked)

| Tier | Price | Scans |
|---|---|---|
| Free | $0, ad-gated | 1 / week (per account and per device) |
| Rental | $3.99 / 7 days | 7 |
| Standard | $12.99 / mo · $129.99 / yr | 30 / 360 |
| Pro (Professional) | $24.99 / mo · $249.99 / yr | 60 / 720; no ads; multi-scan |
| Family | $19.99 / mo · $199.99 / yr | 40 / 480 shared, 4 seats |

Top-ups (subscribers only, never expire): 5 / $2.99 · 10 / $4.99 · 20 / $8.99 · Family 25 / $10.99

## Setup

Prerequisites: Node 22, Android Studio, the `scanner-4ea67` Firebase project, `gcloud` signed in as the project owner.

```bash
cd functions && npm install
```

**Configuration:**
- `functions/.env.scanner-4ea67` (committed): model names and launch gates (`PASS1_MODEL`, `PASS2_MODEL`, `MAX_GROUNDING_RETRIES`, `AD_GATE_ENFORCED`, `PLAY_VERIFY_ENABLED`). Firebase manages function environment from this file: **a variable set by hand on a service is dropped by the next deploy.** Every runtime setting goes here.
- `GEMINI_API_KEY` lives in **Google Secret Manager**, bound with `secrets: ["GEMINI_API_KEY"]` on `scan` and `deepDive`. Never in a file.
- `app/google-services.json`, `local.properties`, and keystores are git-ignored.

## Testing

```bash
cd functions
npm test                    # every offline test file in tests/ (one line per file)
npm test -- deepDive        # only files whose name contains "deepDive"

cd .. && ./gradlew testDebugUnitTest assembleDebug   # app unit tests + debug APK
```

Live checks (cost API calls):

```bash
node scripts/rescore.js <requestId> [--runs N]   # re-score a stored specimen with the current engine
node scripts/rescore.js --image <file>           # any image; prints candidate → boundary → floor raisers → final
```

## Deploying

1. List what will go live: every commit since the last deploy (Cloud audit log `UpdateFunction`), including other contributors' commits, plus uncommitted changes.
2. `npm test` green.
3. `firebase deploy --only functions:<name>` for the functions that changed.
4. Verify on the live services: revision Ready, `AD_GATE_ENFORCED=true` on `scan`, `PLAY_VERIFY_ENABLED=true` on `grantEntitlement`, `GEMINI_API_KEY` bound from the secret, no ERROR logs.
5. Commit after the device test passes.

Phone builds go to testers through Firebase App Distribution.

## Business Center: operator commands

Read-only against live production. Run from `functions/`. `business-center.js` uses application-default credentials (`gcloud auth application-default login`); `incident.js` and `rescore.js` use your `gcloud` login.

### Money and volume

```bash
node scripts/business-center.js last | today | week | month   # receipts and costs
node scripts/business-center.js receipt <requestId>           # one scan: model, tokens, cost
node scripts/business-center.js revenue [today|week|month]    # revenue and profit
node scripts/business-center.js trend                         # this week vs last week
node scripts/health.js                                        # field health this week
node scripts/qa-last.js [n]                                   # QA the latest cache records
```

### Operations (`period` = today | week | month | Nd)

```bash
node scripts/business-center.js delivery [period]   # scan delivery, replays, stale claims, phone diagnostics
node scripts/business-center.js adgate [period]     # ad-gate readiness and verified tickets
node scripts/business-center.js failures [14d]      # mass-failure detector by code
node scripts/business-center.js refusals [7d]       # search-refusal tracker (30101)
node scripts/business-center.js prepaid [month]     # prepaid balances
node scripts/business-center.js quality [period]    # research quality
node scripts/business-center.js dives [period]      # Deep Dive scope: finding, mode, violations, background requests
node scripts/business-center.js raisers [period]    # accepted floor raisers + evidence; rebrand check; watchlist
node scripts/business-center.js ledger [period]     # Network Probe outcomes; status codes scrubbed from values
node scripts/business-center.js doors [period]      # Report button doors offered; FTC-only gaps
node scripts/business-center.js redteam [period]    # attacks (pure / hybrid), flagged text, floors, regulatory caps
node scripts/business-center.js state [--out file]  # machine-readable state for AI sessions
```

npm shortcuts: `npm run business:last|today|week|month|health|dives|raisers|ledger|doors|redteam`.

### Investigations

```bash
node scripts/incident.js list [--tag attack|scam|legit|inconclusive|deep_dive] [--days N] [--min-score X]
node scripts/incident.js show <requestId>
node scripts/incident.js ask <requestId> "<question>"   # interrogate Gemini about a stored incident
node scripts/deepdive.js list | <id> | ask <id>         # Deep Dive reports
node scripts/ask-gemini.js <requestId> | last           # interactive session about a scan
node scripts/forensic.js decode <code> | report <requestId> | last
node scripts/list-scans.js [limit]                      # recent scans with cache keys
node scripts/dump-receipts.js <requestId>               # one report's evidence rows
node scripts/clear-cache.js <cacheKey>                  # force a fresh scan of a specimen (writes!)
node scripts/grant-test-entitlements.js                 # test-matrix accounts (writes!)
```

## AI-facing capabilities

Built so an AI session (Gemini or Claude) can debug alongside us from evidence, not memory:

- **Incident Ledger interrogation** (`incident.js ask`): sends Gemini the stored specimen image and the complete trace (every prompt, raw response, grounding query, and source, plus the final report) under an honesty protocol: every statement labeled *observed*, *reconstructed*, or *unknown*. Answers are kept as notes on the incident.
- **State snapshot** (`business-center.js state --out state.json`): git state, deployed revisions, allowlisted settings, the last 24 hours of receipts, failure spikes, refusal rate, and delivery health, as one JSON file an AI session reads first.
- **Scan and Deep Dive interrogation** (`ask-gemini.js`, `deepdive.js ask`): ask the model why it produced a field.
- **Live re-scoring** (`rescore.js`): run a specimen through the current engine and see exactly how the score was built.
- **Reports for every behavior:** each Business Center mode above has a matching test in `functions/tests/`.

## Failure codes

Users see a 5-digit code and a plain-language sentence, never an HTTP status. The table lives in `functions/scanErrorCodes.js` (mirrored in `ScanErrorCodes.kt`) and in the user manual.

## Docs

Published from `docs/` to GitHub Pages and linked in the app: [User Manual](docs/user-manual.md) · [Terms of Service](docs/terms-of-service.md) · [Privacy Statement](docs/privacy-statement.md) · [Legal Statement](docs/legal-statement.md). The Privacy Statement URL goes in Play Console.

## License

All rights reserved © Cipherworks Dev Cottage.

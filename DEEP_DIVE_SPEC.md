# 411 Scanner — Deep Dive Spec

**Status:** Draft for fire review  
**Date:** 2026-10-10

## Concept

The base scan is Chapter 1. Deep Dive is the condensed rest of the book.

The base scan answers: "Is this risky?" Deep Dive answers: "What do I do about it?"

Deep Dive is NOT a re-scan. It is a targeted follow-up investigation into a specific finding from the base scan.

## What It Does

Takes one specific finding from the base scan and investigates it fully as a narrative.

Examples:
- Base: "Grey market API keys detected" → Deep Dive: "Here are the sellers, the revocation risk for each, what happens if the key is killed, and your alternatives"
- Base: "Complaint pattern: cashout blocked" → Deep Dive: "Here are 47 reviews describing the pattern, the company's response rate, your recourse options, and timeline of when complaints started"

## Format

Narrative investigative report, not a data dump. Organized as:
1. **The Finding** — what the base scan flagged (one paragraph recap)
2. **The Investigation** — what we found when we dug deeper (the meat)
3. **The Timeline** — when did this start, how has it evolved
4. **Your Options** — what you can actually do about it
5. **Sources** — every claim linked to its evidence

## What It Doesn't Do

- Does not re-run the 6-factor analysis
- Does not recalculate the Action Meter score
- Does not restate the Essential 411
- Does not guarantee new findings

## Pricing & Policy

- **Cost:** Exactly 1 topUpScans credit. Never subscription scans.
- **When charged:** After input validation, before investigation begins.
- **Empty results:** If the investigation finds nothing new, that IS the result. The credit pays for the search, not guaranteed findings. The report will state: "We investigated [X] thoroughly and found no additional evidence beyond the base scan."
- **Cache:** Cached Deep Dive results still cost 1 credit.
- **Family:** Family members draw from the shared family bank.
- **No separate product:** No dedicated Deep Dive Play product at launch. Uses existing top-up bank.

## Technical

- **Input:** scan request ID + specific finding to investigate (user selects from base scan findings, or auto-suggests the highest-risk finding)
- **Model:** Single focused Gemini pass with narrow prompt (not the full 6-factor pipeline)
- **Grounding:** 10-15 additional sources targeted at the specific question
- **Output:** Structured narrative report (see Format above), stored as `deep_dive_receipts` in Firestore
- **Token budget:** Target <30k tokens (roughly half a base scan)

## UI

- Deep Dive button appears on the result screen after base scan completes
- User selects which finding to investigate (or accepts the suggested one)
- Confirmation screen: "This will use 1 top-up credit. Continue?"
- Progress indicator during investigation
- Result displayed as a scrollable narrative report with inline source links

## Decisions (fire, 2026-10-10)

1. **Multiple Deep Dives per base scan:** YES — 1 credit each, user can investigate different findings separately.
2. **Deep Dive on cached base scans:** YES — the investigation is fresh even if the base scan is cached.
3. **Maximum narrative length:** ~2000 words, focused.

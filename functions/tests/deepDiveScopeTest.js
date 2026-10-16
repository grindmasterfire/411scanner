/**
 * Deep Dive scope (fire 2026-10-16): one finding per dive, never the whole
 * target; pattern mode only for an unnameable operator on a scam verdict;
 * one cache entry per (cacheKey, targetName, findingId).
 * Run: node tests/deepDiveScopeTest.js
 */
const assert = require("assert");
const {
  DEEP_DIVE_SYSTEM_PROMPT,
  buildDeepDivePrompt,
  searchRequest,
} = require("../deepDiveEngine");
const { resolveFinding, suggestFinding } = require("../deepDiveFinding");
const { isPatternTarget } = require("../patternFiles");
const {
  DEEP_DIVE_STANDARD,
  diveKeyFor,
  getCachedDeepDive,
  setCachedDeepDive,
} = require("../deepDiveCacheLayer");
const { buildDeepDiveScopeSummary, formatDeepDiveScopeSummary } = require("../deepDiveScopeReport");

const OLD_WHOLE_TARGET_WORDING = [
  "consumer complaints, regulatory or enforcement actions, court cases, forum and Reddit threads, fees, payout and contract terms",
  "Choose the single most consequential open question the base report raises",
  "report ONLY what is new",
];

// --- Routing: pattern mode needs an unnameable operator AND score >= 8.0 ---

// Navy Federal: entity named, verdict legitimate -> narrow dive.
assert.strictEqual(isPatternTarget({
  solicitation_identity: { confidence: "high", operator: "Navy Federal Credit Union" },
  consumer_card: { action_meter_score: 1.8, verdict_label: "EVERYBODY" },
}), false, "named legitimate entity must not take the pattern path");

// fire's flyer: no digital footprint, operator unnameable, score 1.8 -> narrow (the fix).
assert.strictEqual(isPatternTarget({
  solicitation_identity: { confidence: "pattern_only", operator: "" },
  consumer_card: { action_meter_score: 1.8, verdict_label: "EVERYBODY" },
}), false, "legitimate low-confidence flyer must not take the pattern path");

// Legitimate-but-not-EVERYBODY scores below 8.0 stay narrow too.
for (const score of [3.5, 6.5, 7.9]) {
  assert.strictEqual(isPatternTarget({
    solicitation_identity: { confidence: "unknown" },
    consumer_card: { action_meter_score: score },
  }), false, `score ${score} must not take the pattern path`);
}

// Unnameable operator on a scam verdict -> pattern mode (unchanged behavior).
assert.strictEqual(isPatternTarget({
  solicitation_identity: { confidence: "pattern_only", operator: "Unknown actor (compromised mailbox)" },
  consumer_card: { action_meter_score: 9.2 },
}), true);
assert.strictEqual(isPatternTarget({
  solicitation_identity: { confidence: "unknown" },
  consumer_card: { action_meter_score: 8.0 },
}), true, "8.0 is the boundary");

// UAC 4u (2026-10-16): operator named and confirmed on a scam score -> narrow.
// The old regex matched every name, so this took the pattern path live.
for (const operator of ["Universal AdCom, L.L.C.", "Navy Federal Credit Union", "Stripe", "N/Abrams Holdings"]) {
  assert.strictEqual(isPatternTarget({
    solicitation_identity: { confidence: "confirmed", operator },
    consumer_card: { action_meter_score: 9 },
  }), false, `named operator "${operator}" must not take the pattern path`);
}
// Genuinely unnameable operators on a scam score still do.
for (const operator of ["", "Unknown", "unknown sender", "Unidentified actor", "N/A", "Compromised mailbox", "Threat actor"]) {
  assert.strictEqual(isPatternTarget({
    solicitation_identity: { confidence: "low", operator },
    consumer_card: { action_meter_score: 9 },
  }), true, `unnameable operator "${operator}" takes the pattern path`);
}

// No score on record: never assume a scam.
assert.strictEqual(isPatternTarget({ solicitation_identity: { confidence: "unknown" } }), false);

// --- Finding: the client's pick, else the highest-risk finding ---

const SCAM_REPORT = {
  consumer_card: {
    action_meter_score: 8.7,
    floor_raisers: { advance_fee: true, brand_impersonation: true, credential_harvesting: true },
    floor_raiser_evidence: {
      advance_fee: ["Upfront 'processing fee' before any loan is released."],
      brand_impersonation: ["Letterhead copies a national lender's logo; the 'processing fee' goes to a personal Zelle account."],
      credential_harvesting: [], // claimed, not evidenced: the server rejects it
    },
    metrics: { financial_risk: 9, honest_business_model: 1 },
  },
};
const LEGIT_REPORT = {
  consumer_card: {
    action_meter_score: 1.8,
    tagline: "A real credit union mailer.",
    metrics: {
      financial_risk: 2, personal_data_exposure: 4, wasted_time_and_ads: 3,
      real_substance: 8, practical_utility: 7, honest_business_model: 9,
    },
    metric_annotations: { personal_data_note: "The reply card asks for date of birth and SSN last four." },
  },
};

{
  const f = resolveFinding({ findingId: "fee_17", findingText: "  The $49 'processing fee' charged before approval.  " }, SCAM_REPORT);
  assert.deepStrictEqual(f, { findingId: "fee_17", findingText: "The $49 'processing fee' charged before approval.", source: "client" });
}
{
  // Text without an id gets a stable id, so the same pick hits the same cache entry.
  const a = resolveFinding({ findingText: "Withdrawal blocked after deposit." }, SCAM_REPORT);
  const b = resolveFinding({ findingText: "Withdrawal blocked after deposit." }, SCAM_REPORT);
  assert.ok(a.findingId.startsWith("client_"));
  assert.strictEqual(a.findingId, b.findingId);
}
{
  // Empty or malformed client finding -> auto-suggest.
  assert.strictEqual(resolveFinding({ findingId: "x", findingText: "   " }, SCAM_REPORT).source, "auto");
  assert.strictEqual(resolveFinding("not an object", SCAM_REPORT).source, "auto");
}
{
  // Most severe ACCEPTED Floor-Raiser outranks metrics: credential harvesting
  // was claimed without evidence (rejected), so brand impersonation leads,
  // and the finding carries that raiser's own evidence.
  const f = suggestFinding(SCAM_REPORT);
  assert.strictEqual(f.findingId, "floor_brand_impersonation");
  assert.ok(f.findingText.includes("personal Zelle account"), f.findingText);
  assert.ok(!f.findingText.includes("Upfront"), "another raiser's evidence is not mixed in");
}
{
  // Legitimate report: the worst vector, with its note.
  const f = suggestFinding(LEGIT_REPORT);
  assert.strictEqual(f.findingId, "metric_personal_data_exposure");
  assert.ok(f.findingText.includes("SSN last four"));
}
{
  // Only the app summary: complaint pattern, then the verdict.
  assert.strictEqual(suggestFinding(null, { complaintPattern: "Cashout blocked" }).findingId, "complaint_pattern");
  assert.strictEqual(suggestFinding(null, { verdictLabel: "TRIBE" }).findingId, "verdict");
}

// --- Prompt: the finding, never the whole target ---

{
  const finding = { findingId: "fee_17", findingText: "The $49 processing fee charged before approval." };
  const report = { actionMeterScore: 8.7, essential411: "Base summary." };
  const search = searchRequest(report, "QuickLoan Direct", false, finding);
  const prompt = buildDeepDivePrompt({
    originalReport: report, targetName: "QuickLoan Direct", finding,
    patternMode: false, priorFile: null, findings: "",
  });

  for (const text of [search, prompt]) {
    assert.ok(text.includes(finding.findingText), "finding text present");
  }
  assert.ok(prompt.includes("THE FINDING TO INVESTIGATE"));
  assert.ok(search.includes("10 to 15 sources"));

  for (const text of [search, prompt, DEEP_DIVE_SYSTEM_PROMPT]) {
    for (const old of OLD_WHOLE_TARGET_WORDING) {
      assert.ok(!text.includes(old), `old whole-target wording gone: "${old}"`);
    }
  }
}
{
  // System prompt: four sections, no model-written Sources or URLs, the impersonation rule verbatim.
  for (const label of ["THE FINDING", "THE INVESTIGATION", "THE TIMELINE", "YOUR OPTIONS"]) {
    assert.ok(DEEP_DIVE_SYSTEM_PROMPT.includes(`\n${label}\n`), `section ${label}`);
  }
  assert.ok(DEEP_DIVE_SYSTEM_PROMPT.includes("Never write a SOURCES section"));
  assert.ok(DEEP_DIVE_SYSTEM_PROMPT.includes("Never write a URL anywhere"));
  assert.ok(DEEP_DIVE_SYSTEM_PROMPT.includes(
    "When a specimen wraps a real person's identity or a real brand around the scammer's own banking or marketing details, that is impersonation — a scam. A real name, photo, or brand on the surface does not make the operation legitimate."
  ));
  for (const rule of ["Never re-run the 6-factor analysis", "Never restate the Essential 411", "Never recalculate"]) {
    assert.ok(DEEP_DIVE_SYSTEM_PROMPT.includes(rule), rule);
  }
}
{
  // Pattern dives stay pattern-scoped: no single-finding block.
  const prompt = buildDeepDivePrompt({
    originalReport: {}, targetName: "Unknown sender", finding: { findingId: "pattern", findingText: "" },
    patternMode: true, priorFile: null, findings: "",
  });
  assert.ok(!prompt.includes("THE FINDING TO INVESTIGATE"));
}

// --- Cache: one entry per (cacheKey, targetName, findingId) ---

function fakeDb() {
  const docs = {};
  const merge = (into, from) => {
    for (const [k, v] of Object.entries(from)) {
      if (v && typeof v === "object" && !Array.isArray(v) && into[k] && typeof into[k] === "object") merge(into[k], v);
      else into[k] = v;
    }
  };
  return {
    docs,
    collection: () => ({
      doc: (id) => ({
        get: async () => ({ exists: id in docs, data: () => docs[id] }),
        set: async (data) => { docs[id] = docs[id] || {}; merge(docs[id], JSON.parse(JSON.stringify(data))); },
      }),
    }),
  };
}

(async () => {
  const db = fakeDb();
  db.docs.scan_abc = { report: { consumer_card: {} }, deepDive: "old whole-target dive", deepDiveTelemetry: { deepDiveStandard: 2 } };
  const tel = { deepDiveStandard: DEEP_DIVE_STANDARD };

  // The pre-fix single-field dive is never resold.
  assert.strictEqual(await getCachedDeepDive(db, "scan_abc", "QuickLoan", "fee_17"), null);

  await setCachedDeepDive(db, "scan_abc", "QuickLoan", "fee_17", "dive on the fee", tel);
  await setCachedDeepDive(db, "scan_abc", "QuickLoan", "floor_brand_impersonation", "dive on the impersonation", tel);

  assert.strictEqual((await getCachedDeepDive(db, "scan_abc", "QuickLoan", "fee_17")).text, "dive on the fee");
  assert.strictEqual((await getCachedDeepDive(db, "scan_abc", "QuickLoan", "floor_brand_impersonation")).text, "dive on the impersonation");
  assert.strictEqual(await getCachedDeepDive(db, "scan_abc", "Other Target", "fee_17"), null, "targetName is part of the key");
  assert.ok(db.docs.scan_abc.report, "base report untouched");

  // Older-standard entries under the new key are regenerated, not resold.
  await setCachedDeepDive(db, "scan_abc", "QuickLoan", "verdict", "stale", { deepDiveStandard: DEEP_DIVE_STANDARD - 1 });
  assert.strictEqual(await getCachedDeepDive(db, "scan_abc", "QuickLoan", "verdict"), null);

  // Keys are Firestore-safe (no dots or slashes).
  assert.match(diveKeyFor("a.b/c", "x.y", "z/w"), /^[0-9a-f]{32}$/);

  // --- Report: `business-center.js dives` ---
  const at = (min) => new Date(Date.parse("2026-10-16T15:00:00Z") + min * 60000);
  const receipts = [
    { requestId: "old1", createdAt: at(-600), cacheHit: false, googleSearchQueries: 4 },
    { requestId: "d1", createdAt: at(1), deepDiveStandard: 3, patternMode: false, baseScore: 1.8,
      targetName: "Navy Federal flyer", findingId: "metric_personal_data_exposure", findingSource: "auto",
      findingText: "Personal Data Exposure (4/10): asks for SSN last four.", googleSearchQueries: 9 },
    { requestId: "d2", createdAt: at(2), deepDiveStandard: 3, patternMode: true, baseScore: 9.2,
      targetName: "Unknown sender", findingId: "pattern", findingSource: "pattern", findingText: "", googleSearchQueries: 7 },
    { requestId: "d3", createdAt: at(3), deepDiveStandard: 3, patternMode: false, baseScore: 8.7, cacheHit: true,
      targetName: "QuickLoan", findingId: "fee_17", findingSource: "client", findingText: "The $49 fee." },
    // Rule breakers the report must surface.
    { requestId: "bad1", createdAt: at(4), deepDiveStandard: 3, patternMode: true, baseScore: 1.8, findingId: "pattern" },
    { requestId: "bad3", createdAt: at(6), deepDiveStandard: 3, patternMode: true, baseScore: 9, findingId: "pattern",
      findingSource: "pattern", operator: "Universal AdCom, L.L.C.", identityConfidence: "confirmed" },
    { requestId: "bad2", createdAt: at(5), deepDiveStandard: 3, patternMode: false, baseScore: 5, findingId: null, failureCode5: "70101" },
  ];
  const s = buildDeepDiveScopeSummary(receipts);
  assert.strictEqual(s.total, 7);
  assert.strictEqual(s.legacy, 1, "pre-fix receipts are not judged");
  assert.strictEqual(s.cacheHits, 1);
  assert.strictEqual(s.failed, 1);
  assert.deepStrictEqual(s.byMode, { narrow: 3, pattern: 3 });
  assert.deepStrictEqual(s.bySource, { auto: 1, pattern: 2, client: 1, none: 2 });
  assert.strictEqual(s.searches, 20);
  assert.deepStrictEqual(s.violations.map((v) => v.requestId).sort(), ["bad1", "bad2", "bad3"]);
  assert.strictEqual(s.recent[0].requestId, "bad3", "newest first");
  const text = formatDeepDiveScopeSummary(s, "test");
  assert.ok(text.includes("SCOPE VIOLATIONS: 3"));
  assert.ok(text.includes("pattern dive on a confirmed operator (Universal AdCom, L.L.C.)"));
  assert.ok(text.includes("pattern dive on score 1.8"));
  assert.ok(text.includes("narrow dive with no finding"));
  assert.ok(text.includes("auto: metric_personal_data_exposure — Personal Data Exposure"));
  assert.ok(!/uid/i.test(text), "no account ids printed");
  assert.ok(formatDeepDiveScopeSummary(buildDeepDiveScopeSummary([]), "empty").includes("Scope violations: 0"));

  console.log("deepDiveScopeTest: all passed");
})().catch((e) => { console.error(e); process.exit(1); });

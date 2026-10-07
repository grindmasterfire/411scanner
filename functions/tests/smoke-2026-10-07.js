/**
 * Smoke tests for 2026-10-07 additions: revenue ledger, Business Center v2
 * (tiers, trend, deep dive), failure taxonomy, receipt tier stamping.
 * Run: node tests/smoke-2026-10-07.js
 */
const assert = require("node:assert/strict");

const {
  REVENUE_PRICE_TABLE,
  priceFor,
  buildRevenueEvent,
  logRevenueEvent,
} = require("../revenueEvents");

const {
  buildBusinessSummary,
  formatBusinessSummary,
  buildRevenueSummary,
  formatRevenueSummary,
  buildDeepDiveSummary,
  formatDeepDiveSummary,
} = require("../businessCenterReport");

const {
  messageFor,
  causeToCode5,
} = require("../scanErrorCodes");

const {
  buildScanReceipt,
} = require("../scanReceiptBuilder");

const {
  estimateGeminiTokenCost,
} = require("../tokenCostEstimator");

let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok: ${name}`);
  } catch (e) {
    console.error(`  FAIL: ${name}\n    ${e.message}`);
    process.exitCode = 1;
  }
}

(async () => {
console.log("== revenueEvents ==");

check("price table has 12 products", () => {
  assert.equal(Object.keys(REVENUE_PRICE_TABLE).length, 12);
});

check("all 11 client product IDs priced (incl standard_weekly alias)", () => {
  const ids = ["standard_weekly","standard_monthly","standard_annual",
    "pro_monthly","pro_annual","family_monthly","family_annual",
    "topup_5","topup_10","topup_20","topup_family_25"];
  for (const id of ids) assert.ok(priceFor(id), `missing ${id}`);
  assert.equal(priceFor("standard_weekly").priceUsd, 3.99);
  assert.equal(priceFor("rental_weekly").priceUsd, 3.99); // legacy alias
  assert.equal(priceFor("bogus"), null);
});

check("granted subscription event", () => {
  const e = buildRevenueEvent({uid:"u1",productId:"pro_annual",
    verificationMode:"trust-client",verificationVerified:true,outcome:"granted"});
  assert.equal(e.priceUsd, 249.99);
  assert.equal(e.tier, "pro");
  assert.equal(e.period, "annual");
  assert.equal(e.scansGranted, 720);
  assert.equal(e.kind, "subscription");
});

check("granted topup event", () => {
  const e = buildRevenueEvent({uid:"u1",productId:"topup_10",
    verificationMode:"trust-client",verificationVerified:true,outcome:"granted"});
  assert.equal(e.priceUsd, 4.99);
  assert.equal(e.scansGranted, 10);
});

check("rejected event earns nothing but records attempt", () => {
  const e = buildRevenueEvent({uid:"u1",productId:"standard_monthly",
    verificationMode:"unknown",verificationVerified:false,
    outcome:"rejected",rejectionReason:"verify-failed"});
  assert.equal(e.priceUsd, 0);
  assert.equal(e.attemptedPriceUsd, 12.99);
  assert.equal(e.rejectionReason, "verify-failed");
});

check("logRevenueEvent never throws (db failure)", async () => {
  const badDb = { collection: () => { throw new Error("down"); } };
  await logRevenueEvent(badDb, {test:1}); // must not throw
});

console.log("== businessCenter: tiers ==");
check("byTier aggregation with unknown fallback", () => {
  const s = buildBusinessSummary([
    {mode:"fresh_analysis",tier:"free",usage:{},cost:{requestResearchCostUsdAtPaidRate:0.3}},
    {mode:"exact",tier:"free",usage:{},cost:{}},
    {mode:"fresh_analysis",tier:"standard",usage:{},cost:{requestResearchCostUsdAtPaidRate:0.28}},
    {mode:"fresh_analysis",usage:{},cost:{requestResearchCostUsdAtPaidRate:0.25}},
  ]);
  assert.equal(s.byTier.free.requests, 2);
  assert.equal(s.byTier.free.cacheHits, 1);
  assert.equal(s.byTier.standard.freshCostUsd, 0.28);
  assert.equal(s.byTier.unknown.requests, 1);
  const out = formatBusinessSummary(s, "T");
  assert.ok(out.includes("USAGE BY TIER"));
  assert.ok(out.includes("free: 2 requests"));
});

console.log("== businessCenter: revenue ==");
check("revenue summary + profit line", () => {
  const ev = (pid, outcome, reason) => buildRevenueEvent({uid:"u",productId:pid,
    verificationMode:"trust-client",verificationVerified:outcome==="granted",
    outcome, rejectionReason:reason});
  const s = buildRevenueSummary([
    ev("standard_monthly","granted"), ev("topup_5","granted"),
    ev("pro_annual","rejected","verify-failed"),
  ]);
  assert.equal(s.grantedEvents, 2);
  assert.equal(s.rejectedEvents, 1);
  assert.ok(Math.abs(s.grantedRevenueUsd - 15.98) < 0.001);
  assert.equal(s.byKind.topup.units, 1);
  assert.equal(s.rejections["verify-failed"].count, 1);
  assert.ok(Math.abs(s.mrrEstimateUsd - 12.99) < 0.001); // topup excluded
  const out = formatRevenueSummary(s, 4.25, "T");
  assert.ok(out.includes("GROSS MARGIN:"));
  assert.ok(out.includes("PROFIT LINE"));
  // margin = 15.98 - 4.25 = 11.73
  assert.ok(out.includes("$11.7300"));
});

console.log("== businessCenter: deep dive ==");
check("deep dive summary", () => {
  const s = buildDeepDiveSummary([
    {cacheHit:true,tokenCostUsd:0,promptTokens:0,outputTokens:0},
    {cacheHit:false,tokenCostUsd:0.045,promptTokens:8000,outputTokens:2000},
    {cacheHit:false,tokenCostUsd:0,failureCode5:"70101"},
  ]);
  assert.equal(s.total, 3);
  assert.equal(s.cacheHits, 1);
  assert.equal(s.failures, 1);
  assert.equal(s.creditsConsumed, 3);
  assert.ok(Math.abs(s.tokenCostUsd - 0.045) < 0.0001);
  const out = formatDeepDiveSummary(s, "T");
  assert.ok(out.includes("Deep dives: 3"));
  assert.ok(out.includes("70101"));
});

console.log("== failure taxonomy ==");
check("all 18 codes resolve to messages", () => {
  const codes = ["10101","10102","20101","20102","20201","20301",
    "30101","30201","40101","40201","40301","50101","50201",
    "60101","60102","70101","80101","90101"];
  for (const c of codes) {
    const m = messageFor(c);
    assert.ok(m && m.length > 10, `code ${c} missing message`);
  }
  assert.ok(messageFor("99999").length > 0); // unknown code fallback
});
check("60102 is the ad-gate code", () => {
  assert.ok(messageFor("60102").toLowerCase().includes("ad"));
});
check("causeToCode5 maps grounding rejections", () => {
  assert.equal(causeToCode5("grounding_rejected"), "30101");
});

console.log("== receipt builder: tier ==");
check("tier stamped on receipt", () => {
  const r = buildScanReceipt({requestId:"r1",mode:"fresh_analysis",
    report:{},telemetry:{},tier:"family"});
  assert.equal(r.tier, "family");
});
check("tier defaults to unknown", () => {
  const r = buildScanReceipt({requestId:"r1",mode:"exact",report:{}});
  assert.equal(r.tier, "unknown");
});

console.log("== token cost estimator ==");
check("estimator on dive-shaped telemetry", () => {
  const r = estimateGeminiTokenCost(
    {promptTokenCount:8000,candidatesTokenCount:2000,thoughtsTokenCount:500});
  assert.ok(r.estimatedTokenCostUsd > 0);
  assert.ok(r.pricing.rateVersion.includes("2026"));
});

console.log(`\n${passed} smoke checks passed${process.exitCode ? " (WITH FAILURES)" : ""}.`);
})();

/**
 * Required-infrastructure exceptions (ruling 2026-10-14) and the unified
 * action ladder. Run: node tests/requiredInfrastructureTest.js
 */
const assert = require("assert");
const { applyRequiredInfrastructure, matchRequiredInfrastructure } = require("../requiredInfrastructure");
const { getVerdict } = require("../actionMeter");
const wf = require("../scanWorkflow");

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

function dnbResult(overrides = {}, report = {}) {
  return {
    report: {
      consumer_card: {
        target_name: "myD&B Mobile App",
        developer_or_entity: "Dun & Bradstreet, Inc.",
        interface_surface: "social_ad",
        action_meter_score: 8.5,
        verdict_label: "DELETE FROM DEVICE AND REPORT",
        action_verdict_badge: "DELETE_FROM_DEVICE_AND_REPORT",
        essential_411: "FTC 2022 order; 2025 $5.7M settlement.",
        metrics: { financial_risk: 8 },
        floor_raisers: {},
        ...overrides,
      },
      ...report,
    },
  };
}

/* Unified ladder --------------------------------------------------- */

test("ladder: one set of tiers at every boundary", () => {
  const label = (s) => getVerdict(s).label;
  assert.equal(label(7.0), "PROFESSIONAL CONSIDERATION ONLY");
  assert.equal(label(7.9), "PROFESSIONAL CONSIDERATION ONLY");
  assert.equal(label(8.0), "DELETE FROM DEVICE");
  assert.equal(label(8.4), "DELETE FROM DEVICE");
  assert.equal(label(8.5), "DELETE FROM DEVICE AND REPORT");
  assert.equal(label(8.9), "DELETE FROM DEVICE AND REPORT");
  assert.equal(label(9.0), "REPORT TO PLATFORM");
  assert.equal(label(9.9), "REPORT TO PLATFORM");
  assert.equal(label(10.0), "DELETE FROM EARTH");
  assert.equal(getVerdict(8.5).badge, "DELETE_FROM_DEVICE_AND_REPORT");
});

test("ladder: a cached report's old label is re-derived from its score", () => {
  const cached = { report: { consumer_card: { action_meter_score: 8.2, verdict_label: "PASS ON THIS ONE" } } };
  wf._relabelVerdict(cached);
  assert.equal(cached.report.consumer_card.verdict_label, "DELETE FROM DEVICE");
  assert.equal(cached.report.consumer_card.action_meter_score, 8.2);
});

/* Exceptions -------------------------------------------------------- */

test("D&B at 8.5: shown at 7.9 professional consideration, findings intact", () => {
  const result = dnbResult();
  const out = applyRequiredInfrastructure(result, { getVerdict });
  const card = result.report.consumer_card;
  assert.deepEqual(out, { status: "confirmed", entity: "Dun & Bradstreet, Inc.", applied: true });
  assert.equal(card.action_meter_score, 7.9);
  assert.equal(card.verdict_label, "PROFESSIONAL CONSIDERATION ONLY");
  assert.equal(card.essential_411, "FTC 2022 order; 2025 $5.7M settlement.", "findings untouched");
  assert.deepEqual(card.metrics, { financial_risk: 8 }, "metrics untouched");
  assert.equal(card.required_infrastructure.evidence_based_score, 8.5);
  assert.equal(card.required_infrastructure.evidence_based_verdict, "DELETE FROM DEVICE AND REPORT");
  assert.ok(card.required_infrastructure.instructions.includes("$5.7 million"));
});

test("no age filter: findings of any age come through byte for byte", () => {
  const result = dnbResult({
    essential_411: "2020: complaint pattern. 2022: FTC order. 2025: $5.7M settlement.",
    metric_annotations: { financial_risk_note: "Renewal disclosures (FTC, 2022)." },
  }, {
    technical_ledger: {
      regulatory_record: {
        complaintPattern: "Complaints since 2019",
        actions: [{ year: 2021 }, { year: 2022 }, { year: 2025 }],
      },
    },
    sources: ["https://www.ftc.gov/2022-order", "https://www.ftc.gov/2025-settlement"],
  });
  const before = JSON.parse(JSON.stringify(result.report));
  applyRequiredInfrastructure(result, { getVerdict });
  const after = JSON.parse(JSON.stringify(result.report));
  // Only these card fields may change; everything else is identical.
  for (const key of ["action_meter_score", "verdict_label", "action_verdict_badge", "required_infrastructure"]) {
    delete before.consumer_card[key];
    delete after.consumer_card[key];
  }
  assert.deepEqual(after, before);
});

test("D&B matched by name variants and its own domain", () => {
  assert.ok(matchRequiredInfrastructure({ developer_or_entity: "Dun and Bradstreet" }));
  assert.ok(matchRequiredInfrastructure({ target_name: "myD&B" }));
  const onSite = dnbResult({ interface_surface: "https://www.dnb.com/products" });
  assert.equal(applyRequiredInfrastructure(onSite, { getVerdict }).status, "confirmed");
  const onPlay = dnbResult({ interface_surface: "play.google.com/store/apps/details?id=com.dnb.mydnb" });
  assert.equal(applyRequiredInfrastructure(onPlay, { getVerdict }).status, "confirmed");
});

test("manual entry: D&B shows 7.9 whatever the scan scored (the 7.2 scan)", () => {
  const result = dnbResult({ action_meter_score: 7.2, verdict_label: "PROFESSIONAL CONSIDERATION ONLY" });
  const out = applyRequiredInfrastructure(result, { getVerdict });
  assert.equal(out.applied, true);
  assert.equal(result.report.consumer_card.action_meter_score, 7.9);
  assert.equal(result.report.consumer_card.verdict_label, "PROFESSIONAL CONSIDERATION ONLY");
  assert.equal(result.report.consumer_card.required_infrastructure.evidence_based_score, 7.2);
  const high = dnbResult({ action_meter_score: 9.3 });
  applyRequiredInfrastructure(high, { getVerdict });
  assert.equal(high.report.consumer_card.action_meter_score, 7.9);
});

test("impersonator: brand-impersonation floor raiser blocks the exception", () => {
  const result = dnbResult({ action_meter_score: 9.4, floor_raisers: { brand_impersonation: true } });
  const out = applyRequiredInfrastructure(result, { getVerdict });
  assert.equal(out.status, "blocked");
  assert.equal(result.report.consumer_card.action_meter_score, 9.4);
});

test("impersonator: D&B name on a foreign domain blocks the exception", () => {
  const viaSurface = dnbResult({ interface_surface: "https://dnb-verify-now.com/fee" });
  assert.equal(applyRequiredInfrastructure(viaSurface, { getVerdict }).status, "blocked");
  const viaIdentity = dnbResult({}, { solicitation_identity: { destination_domain: "duns-renewal-center.net" } });
  assert.equal(applyRequiredInfrastructure(viaIdentity, { getVerdict }).status, "blocked");
  assert.equal(viaIdentity.report.consumer_card.action_meter_score, 8.5);
});

test("no false matches: other 'D&B' names are not Dun & Bradstreet", () => {
  assert.equal(matchRequiredInfrastructure({ target_name: "D&B Supply", developer_or_entity: "D&B Supply Co." }), null);
  assert.equal(matchRequiredInfrastructure({ target_name: "DUNS number lookup service" }), null);
});

test("the evaluation is never told about required infrastructure", () => {
  const prompt = JSON.stringify(require("../prompt"));
  const schema = JSON.stringify(require("../consumerCardSchema"));
  assert.ok(!/required.infrastructure/i.test(prompt), "prompt must not mention it");
  assert.ok(!/required_infrastructure/.test(schema), "schema must not carry it");
});

test("no match: report untouched", () => {
  const result = { report: { consumer_card: { target_name: "Random App", action_meter_score: 8.7 } } };
  assert.equal(applyRequiredInfrastructure(result, { getVerdict }), null);
  assert.equal(result.report.consumer_card.required_infrastructure, undefined);
});

/* What the phone receives -------------------------------------------- */

test("client view: report and cache key only; no model, tokens, or internals", () => {
  const full = dnbResult();
  applyRequiredInfrastructure(full, { getVerdict });
  Object.assign(full, {
    cache: { hit: true, fresh: true, mode: "cross_creative", key: "abc123", candidate: { overlap: 0.9 } },
    telemetry: { model: "gemini-x", totalTokenCount: 60757 },
    receipt: { model: "gemini-x", usage: { totalTokens: 60757 }, pricing: {} },
    composition: { bands: [] },
    solicitationIdentity: { key: "identity_x" },
    identityHistory: [{ state: 1 }],
  });
  const view = wf._clientView(full);
  assert.deepEqual(Object.keys(view).sort(), ["cache", "report"]);
  assert.deepEqual(view.cache, { key: "abc123" });
  const text = JSON.stringify(view);
  for (const leak of ["gemini-x", "60757", "cross_creative", "identity_x", "evidence_based_score", "instructions"]) {
    assert.ok(!text.includes(leak), `client view leaks ${leak}`);
  }
  assert.deepEqual(view.report.consumer_card.required_infrastructure,
    { status: "confirmed", applied: true, entity: "Dun & Bradstreet, Inc." });
  assert.equal(view.report.consumer_card.action_meter_score, 7.9);
  // The server-side object keeps everything for the Business Center.
  assert.equal(full.report.consumer_card.required_infrastructure.evidence_based_score, 8.5);
});

let passed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    passed++;
    console.log(`  ok: ${name}`);
  } catch (e) {
    console.log(`  FAIL: ${name}\n    ${e.stack.split("\n").slice(0, 3).join("\n    ")}`);
  }
}
console.log(`${passed}/${tests.length} passed`);
process.exitCode = passed === tests.length ? 0 : 1;

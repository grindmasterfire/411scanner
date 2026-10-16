/**
 * UAC manual score + watchlist (owner ruling 2026-10-16): 8.4 DELETE FROM
 * DEVICE; historical or disputed impersonation is recorded, not scored;
 * adjudicated impersonation re-triggers full weight.
 * Run: node tests/uacWatchlistTest.js
 */
const assert = require("assert");
const { applyRequiredInfrastructure, REQUIRED_INFRASTRUCTURE_ENTRIES } = require("../requiredInfrastructure");
const { getVerdict } = require("../actionMeter");
const { buildFloorRaiserSummary, formatFloorRaiserSummary } = require("../floorRaiserReport");

const HISTORICAL = "Police and chambers (Grundy Center IA, Thibodaux LA, Kentucky Lake) warned that UAC callers falsely claimed to work with them; the Baker County FL sheriff said in July 2025 the claim was false, which the company disputes.";
const ADJUDICATED = "In 2027 the Texas Attorney General obtained a consent judgment against Universal AdCom for falsely claiming law-enforcement partnerships.";

function uac({ score = 9.5, raisers = {}, evidence = {}, target = "UAC 4u / UAC Advertising Specialist", domain = "uac4u.com" } = {}) {
  return {
    report: {
      solicitation_identity: { operator: "Universal AdCom, L.L.C.", destination_domain: domain },
      consumer_card: {
        target_name: target,
        developer_or_entity: "Universal AdCom, L.L.C.",
        interface_surface: "print",
        action_meter_score: score,
        verdict_label: getVerdict(score).label,
        floor_raisers: raisers,
        floor_raiser_evidence: evidence,
      },
    },
  };
}
const apply = (r) => applyRequiredInfrastructure(r, { getVerdict });

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test("config: UAC entry is 8.4 with a watchlist and the disputed 2025 item on record", () => {
  const e = REQUIRED_INFRASTRUCTURE_ENTRIES.find((x) => x.id === "uac-universal-adcom");
  assert.ok(e);
  assert.strictEqual(e.score, 8.4);
  assert.deepStrictEqual(e.watch.floorRaisers, ["brand_impersonation", "federal_impersonation"]);
  const baker = e.history.find((h) => h.date.startsWith("2025-07-21"));
  assert.ok(baker && baker.event.startsWith("DISPUTED"));
  assert.ok(e.history.every((h) => /^https:\/\//.test(h.source)), "every history item has a source");
});

test("no impersonation on the scan: 9.0 shows 8.4 DELETE FROM DEVICE, no report", () => {
  const r = uac({ score: 9.0, raisers: { rebrand_pattern: false } });
  const out = apply(r);
  const card = r.report.consumer_card;
  assert.strictEqual(out.status, "confirmed");
  assert.strictEqual(card.action_meter_score, 8.4);
  assert.strictEqual(card.verdict_label, "DELETE FROM DEVICE");
  assert.strictEqual(card.required_infrastructure.evidence_based_score, 9.0);
  assert.ok(!card.required_infrastructure.watch);
});

test("historical / disputed impersonation: held at 8.4, recorded as history", () => {
  for (const name of ["brand_impersonation", "federal_impersonation"]) {
    const r = uac({ raisers: { [name]: true }, evidence: { [name]: [HISTORICAL] } });
    const out = apply(r);
    const card = r.report.consumer_card;
    assert.strictEqual(out.status, "confirmed", name);
    assert.strictEqual(card.action_meter_score, 8.4);
    assert.deepStrictEqual(card.required_infrastructure.watch.seen, [name]);
    assert.deepStrictEqual(card.required_infrastructure.watch.retriggered, []);
    assert.ok(card.required_infrastructure.watch.evidence[name].includes("Baker County"));
  }
});

test("adjudicated impersonation re-triggers: entry steps aside, 9.5 shows", () => {
  const r = uac({ raisers: { brand_impersonation: true }, evidence: { brand_impersonation: [ADJUDICATED] } });
  const out = apply(r);
  assert.strictEqual(out.status, "blocked");
  assert.strictEqual(out.reason, "watchlist_retrigger:brand_impersonation");
  assert.strictEqual(r.report.consumer_card.action_meter_score, 9.5);
  assert.deepStrictEqual(out.watch.retriggered, ["brand_impersonation"]);
});

test("an unrelated judgment in impersonation evidence does not re-trigger", () => {
  const mixed = "Chambers warned UAC callers falsely claimed to represent them. Separately, an $800,000 state regulatory judgment tied to telemarketing abuses.";
  // One statement names both a judgment and false claims: that counts (errs toward re-trigger).
  assert.strictEqual(apply(uac({ raisers: { brand_impersonation: true }, evidence: { brand_impersonation: [mixed] } })).status, "blocked");
  // Separate statements: the judgment is not about impersonation.
  const r = uac({ raisers: { brand_impersonation: true }, evidence: { brand_impersonation: [
    "Chambers warned UAC callers falsely claimed to represent them.",
    "An $800,000 state regulatory judgment tied to telemarketing abuses.",
  ] } });
  assert.strictEqual(apply(r).status, "confirmed");
  assert.strictEqual(r.report.consumer_card.action_meter_score, 8.4);
});

test("non-watched blockers still block (credential harvesting, foreign domain)", () => {
  const harvest = uac({ raisers: { credential_harvesting: true }, evidence: { credential_harvesting: ["Form asks for bank login."] } });
  assert.strictEqual(apply(harvest).reason, "floor_raiser:credential_harvesting");
  const fake = uac({ domain: "uac4u-billing.example" });
  assert.match(apply(fake).reason, /^foreign_domain:/);
});

test("name variants match", () => {
  for (const target of ["UAC4U / UAC Advertising Specialist", "UAC 4u!", "UACNow maps"]) {
    const r = uac({ score: 9, target });
    r.report.consumer_card.developer_or_entity = "";
    assert.strictEqual(apply(r)?.status, "confirmed", target);
  }
});

test("D&B is unaffected: impersonation still blocks (no watchlist)", () => {
  const r = { report: { consumer_card: {
    target_name: "myD&B", developer_or_entity: "Dun & Bradstreet, Inc.", interface_surface: "dnb.com",
    action_meter_score: 9, floor_raisers: { brand_impersonation: true },
    floor_raiser_evidence: { brand_impersonation: [HISTORICAL] },
  } } };
  assert.strictEqual(apply(r).reason, "floor_raiser:brand_impersonation");
});

test("report: watchlist hits show held vs re-triggered", () => {
  const held = { status: "confirmed", entity: "Universal AdCom", watch: { seen: ["brand_impersonation"], retriggered: [], evidence: { brand_impersonation: HISTORICAL } } };
  const hit = { status: "blocked", entity: "Universal AdCom", watch: { seen: ["brand_impersonation"], retriggered: ["brand_impersonation"], evidence: { brand_impersonation: ADJUDICATED } } };
  const quiet = buildFloorRaiserSummary([{ kind: "scan", requestId: "a", score: 8.4, infrastructure: held, floorRaisers: {} }]);
  assert.ok(formatFloorRaiserSummary(quiet, "t").includes("Watchlist: 1 scan(s) saw impersonation evidence on a watchlisted entity, held as history (0 re-triggered)"));
  const loud = buildFloorRaiserSummary([{ kind: "scan", requestId: "b", score: 9.5, infrastructure: hit, floorRaisers: {} }]);
  const text = formatFloorRaiserSummary(loud, "t");
  assert.ok(text.includes("WATCHLIST RE-TRIGGERED: 1"));
  assert.ok(text.includes("RE-TRIGGERED brand_impersonation"));
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); } catch (e) { failed++; console.error(`FAIL ${name}\n  ${e.message}`); }
}
if (failed) process.exit(1);
console.log(`uacWatchlistTest: ${tests.length}/${tests.length} passed`);

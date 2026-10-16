/**
 * "We don't sell redacted" (fire 2026-10-16, UAC 4u): no status code ever
 * ships as a ledger value; registry dates come from RDAP (always public);
 * a badge about the operator's conduct doesn't mark its own domain faked.
 * Run: node tests/registryLedgerTest.js
 */
const assert = require("assert");
const { STATE_CODE, applyRegistryValues, scrubStateCodes } = require("../registryLedger");
const { reasonTemplate } = require("../technicalLedgerEvidence");
const { applyMeasuredLedger } = require("../networkProbe");
const wf = require("../scanWorkflow");
const { buildLedgerHygieneSummary, formatLedgerHygieneSummary } = require("../ledgerHygieneReport");

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

// The UAC report as it shipped: codes in the value slots.
const uacLedger = () => ({
  technical_ledger: {
    domain_registration: {
      registrar: "GoDaddy.com, LLC",
      registered_on: "searched_redacted",
      updated_on: "searched_redacted",
      expires_on: "searched_redacted",
      registrant_name: "searched_redacted",
      registrant_organization: "searched_redacted",
      registrant_country: "US",
      nameservers: [],
    },
    attribution: { aliases: ["UACNow", "searched_not_found"] },
    evidence_receipts: [],
  },
});

test("scrub: codes leave the value slots; each field gets a sentence", () => {
  const r = uacLedger();
  const cleared = scrubStateCodes(r, reasonTemplate);
  const reg = r.technical_ledger.domain_registration;
  for (const f of ["registered_on", "updated_on", "expires_on", "registrant_name", "registrant_organization"]) {
    assert.strictEqual(reg[f], "", f);
    assert.ok(cleared.includes(`domain_registration.${f}`), f);
  }
  assert.strictEqual(reg.registrar, "GoDaddy.com, LLC", "facts untouched");
  assert.deepStrictEqual(r.technical_ledger.attribution.aliases, ["UACNow"]);
  const rows = r.technical_ledger.evidence_receipts;
  const row = rows.find((x) => x.field === "domain_registration.registered_on");
  assert.ok(row && /privacy-protected or redacted\./.test(row.finding), "a full sentence, not a code");
  assert.ok(!JSON.stringify(r.technical_ledger.domain_registration).includes("searched_"));
});

test("scrub: an existing model row for the field is kept, not duplicated", () => {
  const r = uacLedger();
  r.technical_ledger.evidence_receipts.push({ field: "domain_registration.registrant", status: "searched_redacted", finding: "ICANN WHOIS for uac4u.com: registrant hidden by Domains By Proxy." });
  scrubStateCodes(r, reasonTemplate);
  assert.strictEqual(r.technical_ledger.evidence_receipts.filter((x) => x.field.startsWith("domain_registration.registrant")).length, 1,
    "the registrant row covers registrant_name and registrant_organization");
  assert.ok(STATE_CODE.test(" searched_redacted "));
  assert.ok(!STATE_CODE.test("Searched GoDaddy's privacy service"));
});

// What RDAP returned for uac4u.com on 2026-10-16.
const uacProbe = {
  measured: true, domain: "uac4u.com", apex_domain: "uac4u.com", registrar: "GoDaddy.com, LLC",
  registration_dates: { registered: "2014-10-03", updated: "2026-10-04", expires: "2027-10-03" },
  registrant: { name: "", org: "", street: "", city: "", region: "Arizona", postal: "", country: "US", redacted: true },
};

test("registry values: dates and registrar from RDAP replace the model's", () => {
  const r = uacLedger();
  applyMeasuredLedger(r, uacProbe);
  const reg = r.technical_ledger.domain_registration;
  assert.strictEqual(reg.registered_on, "2014-10-03");
  assert.strictEqual(reg.updated_on, "2026-10-04");
  assert.strictEqual(reg.expires_on, "2027-10-03");
  assert.strictEqual(reg.registrar, "GoDaddy.com, LLC");
  assert.strictEqual(reg.registrant_name, "", "redacted registrant is empty, never a code");
  assert.strictEqual(reg.registrant_country, "US");
  const rows = r.technical_ledger.evidence_receipts;
  const dates = rows.find((x) => x.field === "domain_registration.registered_on");
  assert.strictEqual(dates.status, "verified");
  assert.match(dates.finding, /registered on 2014-10-03, last updated on 2026-10-04, set to expire on 2027-10-03\./);
  const who = rows.find((x) => x.field === "domain_registration.registrant");
  assert.strictEqual(who.status, "searched_redacted");
  assert.match(who.finding, /privacy service/);
  assert.match(who.finding, /business records/, "says where the operator IS identified");
});

test("registry values: no registrant published → why, plus who the operator is", () => {
  const r = uacLedger();
  r.technical_ledger.attribution.operator_name = "Universal AdCom, L.L.C.";
  applyMeasuredLedger(r, { ...uacProbe, registrant: null });
  const row = r.technical_ledger.evidence_receipts.find((x) => x.field === "domain_registration.registrant");
  assert.strictEqual(row.status, "searched_redacted");
  assert.match(row.finding, /does not publish the registrant: GoDaddy\.com, LLC withholds the owner's name and address\./);
  assert.match(row.finding, /The operator, Universal AdCom, L\.L\.C\., is identified from business records instead/);
  scrubStateCodes(r, reasonTemplate);
  assert.strictEqual(r.technical_ledger.evidence_receipts.filter((x) => x.field.startsWith("domain_registration.registrant")).length, 1);
});

test("registry values: a public registrant is filled", () => {
  const r = uacLedger();
  applyRegistryValues(r, { ...uacProbe, registrant: { name: "Jane Doe", org: "Acme LLC", country: "US", redacted: false } }, () => {}, "");
  assert.strictEqual(r.technical_ledger.domain_registration.registrant_organization, "Acme LLC");
  assert.strictEqual(r.technical_ledger.domain_registration.registrant_name, "Jane Doe");
});

test("guard: a conduct badge doesn't mark the operator's own domain as faked", () => {
  const uac = {
    solicitation_identity: { canonical_name: "UAC Advertising Specialists", destination_domain: "www.uac4u.com", channel: "print" },
    solicitation_pattern: { solicitation_type: "Print Promotional Card & Telemarketing Funnel",
      behavioral_signals: ["misrepresentation of affiliation with civic and emergency service entities"] },
    consumer_card: { classification_badges: ["B2B Telemarketing", "Civic Impersonation Alerts"] },
    technical_ledger: { attribution: { official_domain: "uac4u.com" } },
  };
  // OCR misread the card's URL as uacau.com (a real, unrelated domain).
  const faked = wf._impersonatedDomains(uac, { links: [{ finalDomain: "uacau.com" }] });
  assert.strictEqual(faked.size, 0, `faked: ${[...faked]}`);
});

test("guard: a faked-brand badge still protects the real brand (red-team #1)", () => {
  const stripe = {
    solicitation_identity: { canonical_name: "Billing Notice", destination_domain: "stripe.com", channel: "email" },
    solicitation_pattern: { solicitation_type: "billing notice" },
    consumer_card: { classification_badges: ["Brand Impersonation"] },
    technical_ledger: { attribution: {} },
  };
  assert.ok(wf._impersonatedDomains(stripe, { links: [{ finalDomain: "strlpe-billing.com" }] }).has("stripe.com"));
});

test("report: probe outcomes and scrubbed fields", () => {
  const s = buildLedgerHygieneSummary([
    { kind: "scan", requestId: "uac", target: "UAC", probeStatus: "impersonated_brand_not_probed", ledgerScrubbed: ["domain_registration.registered_on"] },
    { kind: "scan", requestId: "navy", target: "Navy Federal", probeStatus: "measured", ledgerScrubbed: [] },
    { kind: "scan", requestId: "fail", failureCode5: "80101" },
    { kind: "deep_dive", requestId: "dd" },
  ]);
  assert.strictEqual(s.scans, 2);
  assert.deepStrictEqual(s.byProbe, { impersonated_brand_not_probed: 1, measured: 1 });
  const text = formatLedgerHygieneSummary(s, "t");
  assert.ok(text.includes("STATUS CODES SCRUBBED FROM VALUES: 1"));
  assert.ok(text.includes("OWN DOMAIN NOT MEASURED: 1"));
  assert.ok(text.includes("uac  UAC  [impersonated_brand_not_probed]"));
});

test("prompt: value fields hold facts, never status codes", () => {
  const { SYSTEM_PROMPT } = require("../prompt");
  assert.ok(SYSTEM_PROMPT.includes("Never write a status code (searched_redacted, searched_not_found, unresolved, verified, or any other) into a value field"));
  assert.ok(SYSTEM_PROMPT.includes("Registration dates are always public in the registry record; never call them redacted."));
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); } catch (e) { failed++; console.error(`FAIL ${name}\n  ${e.stack.split("\n").slice(0, 3).join("\n  ")}`); }
}
if (failed) process.exit(1);
console.log(`registryLedgerTest: ${tests.length}/${tests.length} passed`);

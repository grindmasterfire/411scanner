/**
 * Receipt reasons (fire ruling 2026-10-15): a field we couldn't fill tells
 * the client specifically why, never "unresolved" or "not researched".
 * Run: node tests/receiptReasonsTest.js
 */
const assert = require("assert");
const { normalizeEvidenceReceipt } = require("../technicalLedgerEvidence");

const norm = (r) => normalizeEvidenceReceipt({ source_url: "", ...r }, new Map());

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test("model's specific sentence is kept for every searched_* reason", () => {
  for (const status of [
    "searched_not_found", "searched_redacted", "searched_paywalled", "searched_removed",
    "searched_corrupted", "searched_conflicting", "searched_too_new", "searched_beyond_scope",
  ]) {
    const finding = `ICANN WHOIS for goodcallmusic.com checked: ${status}.`;
    const out = norm({ field: "domain_registration.registrant", status, finding });
    assert.equal(out.status, status);
    assert.equal(out.finding, finding);
  }
});

test("empty or generic text gets a plain-language reason, never a field id", () => {
  const cases = [
    ["searched_paywalled", "", /paywall/],
    ["searched_removed", "not found", /deleted or taken down/],
    ["searched_redacted", "Unknown", /privacy-protected/],
    ["searched_corrupted", "", /broken or unreadable/],
  ];
  for (const [status, finding, re] of cases) {
    const out = norm({ field: "domain_registration.registrant", status, finding });
    assert.match(out.finding, re);
    assert.match(out.finding, /who registered the domain/);
    assert.ok(!out.finding.includes("domain_registration"), out.finding);
  }
});

test("legacy states never ship", () => {
  for (const [status, expected] of [
    ["unresolved", "searched_conflicting"],
    ["not_researched", "searched_not_found"],
    ["not_found", "searched_not_found"],
    ["NOT_FOUND", "searched_not_found"],
    ["garbage", "searched_not_found"],
  ]) {
    const out = norm({ field: "regulatory_record.bbb_record", status, finding: "" });
    assert.equal(out.status, expected, status);
    assert.ok(!/unresolved|not researched/i.test(out.finding), out.finding);
  }
});

test("a verified claim with no live source is shown as unconfirmed, with the claim", () => {
  const out = norm({
    field: "attribution.operator_name",
    status: "verified",
    finding: "Operated by Good Call Music LLC, Nashville, TN.",
    source_url: "https://invented.example/about",
  });
  assert.equal(out.status, "searched_unconfirmed");
  assert.equal(
    out.finding,
    "Reported, but not confirmed by a source you can open: Operated by Good Call Music LLC, Nashville, TN."
  );
});

test("the 10/15 Good Call Music text can't come back", () => {
  const out = norm({
    field: "attribution.operator_name",
    status: "unresolved",
    finding: "Unresolved report: attribution.operator_name could not be verified via live grounding this scan.",
  });
  assert.ok(!/unresolved|attribution\.operator_name|live grounding/i.test(out.finding), out.finding);
  assert.match(out.finding, /who operates it/);
});

test("server network measurements stay verified", () => {
  const out = norm({
    field: "infrastructure.asn",
    status: "verified",
    authority: "Network Probe (411 server measurement)",
    finding: "ASN: 53831",
  });
  assert.equal(out.status, "verified");
  assert.equal(out.finding, "ASN: 53831");
});

let passed = 0;
for (const [name, fn] of tests) {
  try { fn(); passed++; console.log(`  ok: ${name}`); }
  catch (e) { console.error(`  FAIL: ${name}\n    ${e.stack}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} passed`);

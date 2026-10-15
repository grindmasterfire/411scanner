/**
 * Every Technical Ledger row a customer reads carries a finding or the
 * reason it couldn't be had (fire ruling 2026-10-15).
 * Run: node tests/ledgerRowsTest.js
 */
const assert = require("assert");
const { fillLedgerDisplays } = require("../ledgerDisplayFill");
const { normalizeEvidenceReceipt } = require("../technicalLedgerEvidence");

const norm = (r) => normalizeEvidenceReceipt({ source_url: "", ...r }, new Map());

// "Not applicable" on a row that applies to every business becomes a reason.
const lic = norm({ field: "regulatory_record.license_status", status: "not_applicable", finding: "Music sites need no license." });
assert.equal(lic.status, "searched_not_found");
assert.match(lic.finding, /business registrations \(entity or DBA filings\)/);
const tp = norm({ field: "consumer_evidence.trustpilot", status: "not_applicable", finding: "n/a" });
assert.equal(tp.status, "searched_not_found");
// Truly-not-applicable rows keep it.
assert.equal(norm({ field: "commercial_terms.withdrawal_gate", status: "not_applicable", finding: "Holds no funds." }).status, "not_applicable");

const ledger = {
  regulatory_record: { license_status: "", ftc_record: "searched_not_found", bbb_record: "BBB A+ rating", complaint_pattern: "", review_spread: "" },
  monetization: { affiliate_disclosure: "", guarantee_terms: "" },
  evidence_receipts: [
    { field: "regulatory_record.license_status", status: "verified", finding: "Delaware LLC #7123456; DBA filed in Los Angeles County." },
    { field: "regulatory_record.ftc_record", status: "searched_not_found", finding: "Searched FTC cases for Good Call Music: none." },
    { field: "consumer_evidence.trustpilot", status: "searched_paywalled", finding: "Trustpilot profile exists but reviews require login." },
    { field: "monetization.affiliate_disclosure", status: "not_applicable", finding: "" },
  ],
};
fillLedgerDisplays(ledger);
const reg = ledger.regulatory_record;
assert.equal(reg.license_status, "Delaware LLC #7123456; DBA filed in Los Angeles County.");
assert.equal(reg.ftc_record, "Searched FTC cases for Good Call Music: none.", "bare code replaced by the reason");
assert.equal(reg.bbb_record, "BBB A+ rating", "real display kept");
assert.match(reg.complaint_pattern, /didn't return a finding on consumer complaints/);
assert.equal(ledger.consumer_evidence.trustpilot, "Trustpilot profile exists but reviews require login.");
assert.equal(ledger.consumer_evidence.bbb_record, "BBB A+ rating", "consumer card mirrors regulatory");
assert.equal(ledger.monetization.affiliate_disclosure, "not_applicable");
assert.match(ledger.monetization.guarantee_terms, /guarantee or refund terms/);
for (const v of [...Object.values(reg), ...Object.values(ledger.consumer_evidence), ...Object.values(ledger.monetization)]) {
  assert.ok(v && !/not established/i.test(v), `row has text: ${v}`);
}
console.log("ledgerRowsTest: all passed");

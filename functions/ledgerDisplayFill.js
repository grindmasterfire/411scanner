/**
 * @file functions/ledgerDisplayFill.js
 * @class Class 1
 * @cap 120 lines
 * @responsibility Every row the client sees in the Technical Ledger's
 *   Regulatory, Consumer Evidence, and Monetization cards carries either the
 *   finding or the specific reason it couldn't be had. Never blank, never
 *   "Not established".
 * @dependencies None.
 * @security_gate Writes display text only from the row's own evidence
 *   receipt (already normalized); never invents a finding.
 * @owner_context fire ruling 2026-10-15: "if we can't sell them the
 *   information, we sell them the reason why we can't get it."
 */

// [section, display field, receipt field, plain-language subject]
const ROWS = [
  ["regulatory_record", "license_status", "regulatory_record.license_status", "business registrations or licenses"],
  ["regulatory_record", "ftc_record", "regulatory_record.ftc_record", "FTC records"],
  ["regulatory_record", "bbb_record", "regulatory_record.bbb_record", "a Better Business Bureau record"],
  ["regulatory_record", "complaint_pattern", "regulatory_record.complaint_pattern", "consumer complaints"],
  ["regulatory_record", "review_spread", "regulatory_record.review_spread", "customer reviews"],
  ["consumer_evidence", "trustpilot", "consumer_evidence.trustpilot", "a Trustpilot profile"],
  ["monetization", "affiliate_disclosure", "monetization.affiliate_disclosure", "an affiliate disclosure"],
  ["monetization", "guarantee_terms", "monetization.guarantee_terms", "guarantee or refund terms"],
];

// Bare state codes are not answers.
const STATE_CODE = /^(verified|not_applicable|not_found|not_researched|unresolved|searched_[a-z_]+|unknown|n\/a|none)$/i;

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function fillLedgerDisplays(ledger) {
  if (!ledger) return ledger;
  const receipts = Array.isArray(ledger.evidence_receipts) ? ledger.evidence_receipts : [];
  const byField = new Map(receipts.map((r) => [clean(r.field), r]));

  for (const [sectionName, field, receiptField, subject] of ROWS) {
    const section = ledger[sectionName] || (ledger[sectionName] = {});
    const current = clean(section[field]);
    if (current && !STATE_CODE.test(current)) continue;

    const receipt = byField.get(receiptField);
    const finding = clean(receipt && receipt.finding);
    if (finding) {
      section[field] = finding;
    } else if (receipt && clean(receipt.status) === "not_applicable") {
      section[field] = "not_applicable";
    } else {
      section[field] = `This scan's research didn't return a finding on ${subject}.`;
    }
  }

  // The app reads Consumer Evidence from here first; mirror the
  // regulatory rows so both cards always agree.
  const consumer = ledger.consumer_evidence;
  const regulatory = ledger.regulatory_record || {};
  for (const field of ["bbb_record", "complaint_pattern", "review_spread"]) {
    if (!clean(consumer[field])) consumer[field] = regulatory[field];
  }
  return ledger;
}

module.exports = {
  fillLedgerDisplays,
  LEDGER_ROWS: ROWS,
};

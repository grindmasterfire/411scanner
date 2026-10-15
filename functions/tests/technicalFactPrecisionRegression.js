/**
 * @file functions/tests/technicalFactPrecisionRegression.js
 * @class Class 1
 * @cap 150 Lines
 * @responsibility Regression coverage for Technical 411 fact authority.
 */

const assert = require("node:assert/strict");

const {
  enforceTechnicalFactPrecision,
} = require("../technicalFactPrecision");

function enforce(regulatory_record, evidence_receipts) {
  return enforceTechnicalFactPrecision({
    regulatory_record,
    evidence_receipts,
  }).regulatory_record;
}

const market = enforce(
  {
    license_status:
      "SEC Regulation A / Regulation CF crowdfunding filings active",
    bbb_record: "not_found",
    ftc_record: "not_found",
    complaint_pattern:
      "User discussions note confusion over liquidity",
    review_spread:
      "Mixed reviews across community channels",
  },
  [
    {
      field:
        "regulatory_record.license_status",
      // As normalized upstream: a claim no live source confirmed.
      status: "searched_unconfirmed",
      finding:
        "Reported, but not confirmed by a source you can open: Mode Mobile conducts offerings under SEC exemptions.",
      source_url: "",
    },
  ]
);

// fire ruling 2026-10-15: the client sees why, never a bare state code.
assert.equal(
  market.license_status,
  "Reported, but not confirmed by a source you can open: Mode Mobile conducts offerings under SEC exemptions."
);
// Narrative with no receipt behind it is dropped, not shown as fact.
for (const field of ["bbb_record", "ftc_record", "complaint_pattern", "review_spread"]) {
  assert.equal(market[field], "");
}

const verified = enforce(
  {
    license_status:
      "License ABC-123 verified",
    bbb_record: "",
    ftc_record: "",
    complaint_pattern: "",
    review_spread: "",
  },
  [
    {
      field:
        "regulatory_record.license_status",
      status: "verified",
      finding:
        "License ABC-123 verified",
      source_url:
        "https://example.gov/license/ABC-123",
    },
    {
      field:
        "regulatory_record.bbb_record",
      status: "searched_not_found",
      finding: "Searched the BBB directory: no business profile exists.",
      source_url: "",
    },
    {
      field:
        "regulatory_record.ftc_record",
      status: "not_applicable",
      finding: "",
      source_url: "",
    },
  ]
);

assert.equal(
  verified.license_status,
  "License ABC-123 verified"
);
assert.equal(
  verified.bbb_record,
  "Searched the BBB directory: no business profile exists."
);
assert.equal(
  verified.ftc_record,
  "not_applicable"
);

const unsupportedVerified = enforce(
  {
    license_status:
      "License claimed by provider",
    bbb_record: "",
    ftc_record: "",
    complaint_pattern: "",
    review_spread: "",
  },
  [
    {
      field:
        "regulatory_record.license_status",
      status: "verified",
      finding:
        "License claimed by provider",
      source_url: "",
    },
  ]
);

assert.equal(
  unsupportedVerified.license_status,
  "Reported, but not confirmed by a source you can open: License claimed by provider"
);

console.log(
  "PASS: regulatory evidence-authority regression"
);

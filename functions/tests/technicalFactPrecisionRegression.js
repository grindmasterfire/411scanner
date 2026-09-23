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
      status: "unresolved",
      finding:
        "Mode Mobile conducts offerings under SEC exemptions.",
      source_url: "",
    },
  ]
);

assert.equal(
  market.license_status,
  "unresolved"
);
assert.equal(
  market.bbb_record,
  "not_researched"
);
assert.equal(
  market.ftc_record,
  "not_researched"
);
assert.equal(
  market.complaint_pattern,
  "not_researched"
);
assert.equal(
  market.review_spread,
  "not_researched"
);

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
      status: "not_found",
      finding: "",
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
  "not_found"
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
  "unresolved"
);

console.log(
  "PASS: regulatory evidence-authority regression"
);

/**
 * @file functions/technicalRegulatoryPrecision.js
 * @class Class 1
 * @cap 150 Lines
 * @responsibility Keep Regulatory & Complaint Record fields inside
 * evidence-receipt authority.
 * @dependencies None.
 * @security_gate Unverified regulatory narratives cannot become facts.
 * @owner_context 411 Scanner Technical 411.
 */

const REGULATORY_FIELDS = [
  "license_status",
  "bbb_record",
  "ftc_record",
  "complaint_pattern",
  "review_spread",
];

const EVIDENCE_STATES = new Set([
  "unresolved",
  "not_found",
  "not_researched",
  "not_applicable",
]);

function clean(value) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function receiptForField(
  receipts,
  field
) {
  const fieldPath =
    `regulatory_record.${field}`;

  return receipts.find(
    (receipt) =>
      clean(receipt?.field) === fieldPath
  ) || null;
}

function enforceRegulatoryEvidencePrecision(
  ledger
) {
  const regulatory =
    ledger?.regulatory_record;

  if (!regulatory) {
    return ledger;
  }

  const receipts =
    Array.isArray(ledger?.evidence_receipts)
      ? ledger.evidence_receipts
      : [];

  for (const field of REGULATORY_FIELDS) {
    const current =
      clean(regulatory[field]);

    const receipt =
      receiptForField(
        receipts,
        field
      );

    if (!receipt) {
      if (current) {
        regulatory[field] =
          "not_researched";
      }

      continue;
    }

    const status =
      clean(receipt.status)
        .toLowerCase();

    if (status === "verified") {
      regulatory[field] =
        clean(receipt.source_url)
          ? current
          : "unresolved";

      continue;
    }

    if (EVIDENCE_STATES.has(status)) {
      regulatory[field] =
        status;

      continue;
    }

    regulatory[field] =
      current
        ? "not_researched"
        : "";
  }

  return ledger;
}

module.exports = {
  enforceRegulatoryEvidencePrecision,
};

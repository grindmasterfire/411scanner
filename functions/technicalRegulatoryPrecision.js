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

// A regulatory field that isn't verified shows its receipt's explanation
// (why we couldn't fill it), never a bare state code.
const NOT_APPLICABLE = "not_applicable";

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
      // No receipt backs this narrative: it can't be shown as fact.
      regulatory[field] = "";
      continue;
    }

    const status =
      clean(receipt.status)
        .toLowerCase();

    if (status === "verified" && clean(receipt.source_url)) {
      regulatory[field] = current;
      continue;
    }

    if (status === NOT_APPLICABLE) {
      regulatory[field] = NOT_APPLICABLE;
      continue;
    }

    // A "verified" claim with no source to open is only a report.
    regulatory[field] =
      status === "verified" && clean(receipt.finding)
        ? `Reported, but not confirmed by a source you can open: ${clean(receipt.finding)}`
        : clean(receipt.finding);
  }

  return ledger;
}

module.exports = {
  enforceRegulatoryEvidencePrecision,
};

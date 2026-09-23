/**
 * @file functions/technicalEvidencePrecision.js
 * @class Class 1
 * @cap 150 Lines
 * @responsibility Prevent Technical 411 certainty from exceeding
 * machine-readable evidence state.
 * @dependencies ./technicalFactPrecision
 * @security_gate Does not create facts or verification.
 * @owner_context 411 Scanner Technical 411.
 */

const {
  enforceTechnicalFactPrecision,
} = require("./technicalFactPrecision");

function clean(value) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function hasVerifiedClaim(
  ledger,
  pattern
) {
  const receipts =
    Array.isArray(
      ledger?.evidence_receipts
    )
      ? ledger.evidence_receipts
      : [];

  return receipts.some((receipt) => {
    const status =
      clean(receipt?.status)
        .toLowerCase();

    const sourceUrl =
      clean(receipt?.source_url);

    const finding =
      clean(receipt?.finding);

    return (
      status === "verified" &&
      sourceUrl &&
      pattern.test(finding)
    );
  });
}

function enforceLicensePrecision(
  ledger
) {
  const verifiedUnlicensed =
    hasVerifiedClaim(
      ledger,
      /\bunlicensed\b|\bnot licensed\b/i
    );

  const verifiedUnregulated =
    hasVerifiedClaim(
      ledger,
      /\bunregulated\b/i
    );

  const regulatory =
    ledger.regulatory_record;

  if (
    regulatory &&
    /\bunlicensed\b/i.test(
      clean(regulatory.license_status)
    ) &&
    !verifiedUnlicensed
  ) {
    regulatory.license_status =
      "unverified";
  }

  if (
    regulatory &&
    /\bunregulated\b/i.test(
      clean(regulatory.license_status)
    ) &&
    !verifiedUnregulated
  ) {
    regulatory.license_status =
      "unverified";
  }

  if (
    !Array.isArray(
      ledger.technical_flags
    )
  ) {
    return;
  }

  ledger.technical_flags =
    ledger.technical_flags
      .map((flag) => {
        const value = clean(flag);
        const matchValue = value.replace(/_/g, " ");

        if (
          /\bunlicensed\b/i.test(matchValue) &&
          !verifiedUnlicensed
        ) {
          return "Gaming license not verified";
        }

        if (
          /\bunregulated\b/i.test(matchValue) &&
          !verifiedUnregulated
        ) {
          return "Gaming regulation not verified";
        }

        return value;
      })
      .filter(Boolean)
      .filter(
        (value, index, values) =>
          values.indexOf(value) === index
      );
}

function enforceTechnicalEvidencePrecision(
  report
) {
  const ledger =
    report?.technical_ledger;

  if (!ledger) {
    return report;
  }

  enforceLicensePrecision(ledger);
  enforceTechnicalFactPrecision(ledger);

  return report;
}

module.exports = {
  enforceTechnicalEvidencePrecision,
};

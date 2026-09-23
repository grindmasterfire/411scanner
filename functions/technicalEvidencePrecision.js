/**
 * @file functions/technicalEvidencePrecision.js
 * @class Class 1
 * @cap 150 Lines
 * @responsibility Prevent Technical 411 certainty from exceeding
 * machine-readable evidence state.
 * @dependencies None.
 * @security_gate Does not create facts or verification.
 * @owner_context 411 Scanner Technical 411.
 */

function clean(value) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function hasVerifiedUnlicensedReceipt(
  ledger
) {
  const receipts =
    Array.isArray(ledger?.evidence_receipts)
      ? ledger.evidence_receipts
      : [];

  return receipts.some((receipt) => {
    const field =
      clean(receipt?.field)
        .toLowerCase();

    const status =
      clean(receipt?.status)
        .toLowerCase();

    const finding =
      clean(receipt?.finding);

    const sourceUrl =
      clean(receipt?.source_url);

    return (
      status === "verified" &&
      field.includes("license") &&
      sourceUrl.length > 0 &&
      (
        /\bunlicensed\b/i.test(finding) ||
        /\bnot licensed\b/i.test(finding)
      )
    );
  });
}

function enforceLicensePrecision(
  ledger
) {
  if (
    !ledger ||
    hasVerifiedUnlicensedReceipt(ledger)
  ) {
    return;
  }

  const regulatory =
    ledger.regulatory_record;

  if (
    regulatory &&
    /\bunlicensed\b/i.test(
      clean(regulatory.license_status)
    )
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
        const value =
          clean(flag);

        if (
          /\bunlicensed\b/i.test(value)
        ) {
          return "Gaming license not verified";
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

  return report;
}

module.exports = {
  enforceTechnicalEvidencePrecision,
};

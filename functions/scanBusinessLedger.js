/**
 * @file functions/scanBusinessLedger.js
 * @class Class 2
 * @cap 250 Lines
 * @responsibility Record T07 request receipts and accepted fresh-investigation accounting.
 * @dependencies ./scanReceiptBuilder, ./scanBusinessLedgerStore
 * @security_gate Observability only. Ledger writes never affect diagnosis, scoring, identity, or cache eligibility.
 * @owner_context 411 Scanner T07 Business Center accounting orchestration.
 *
 * Cache reuse records one zero-new-AI request receipt.
 * Accepted fresh research records one investigation plus its request receipt.
 * Grounding-rejected research records its incurred provider cost as a receipt
 * but never creates an accepted investigation record.
 */

const {
  buildScanReceipt,
} = require("./scanReceiptBuilder");

const {
  createScanInvestigation,
  createScanReceipt,
} = require("./scanBusinessLedgerStore");

/**
 * Record an exact or cross-creative Cache Bank request.
 *
 * sourceTelemetry may describe the original paid investigation, but
 * buildScanReceipt guarantees that old cost is not charged again.
 */
async function recordReuseAccounting(
  db,
  serverTimestamp,
  {
    requestId,
    mode,
    cacheKey,
    sourceCacheKey = null,
    report,
    sourceTelemetry = null,
  }
) {
  const sourceInvestigationId =
    sourceTelemetry?.investigationId || null;

  const receipt =
    buildScanReceipt({
      requestId,
      sourceInvestigationId,
      cacheKey,
      sourceCacheKey,
      mode,
      report,
      sourceTelemetry,
    });

  await createScanReceipt(
    db,
    requestId,
    receipt,
    serverTimestamp()
  );

  return receipt;
}

/**
 * Record one accepted Gemini research event and its request receipt.
 *
 * The investigation owns provider telemetry and the forensic report.
 * The receipt owns the economics of this particular request.
 */
async function recordFreshAccounting(
  db,
  serverTimestamp,
  {
    requestId,
    investigationId,
    mode,
    cacheKey,
    report,
    telemetry,
    composition = null,
    solicitationIdentityKey = null,
  }
) {
  const createdAt =
    serverTimestamp();

  await createScanInvestigation(
    db,
    investigationId,
    {
      requestId,
      cacheKey,
      mode,
      reportSnapshot:
        report,
      telemetry,
      composition,
      solicitationIdentityKey,
    },
    createdAt
  );

  const receipt =
    buildScanReceipt({
      requestId,
      investigationId,
      cacheKey,
      mode,
      report,
      telemetry,
    });

  await createScanReceipt(
    db,
    requestId,
    receipt,
    createdAt
  );

  return receipt;
}

/**
 * Record provider cost when mandatory grounding fails closed.
 *
 * No scan_investigations record is created because 411 did not accept,
 * score, persist, or authorize the provider response as intelligence.
 */
async function recordGroundingRejectedAccounting(
  db,
  serverTimestamp,
  {
    requestId,
    cacheKey,
    telemetry,
    groundingCause,
  }
) {
  const cause = groundingCause || "unknown";
  const { causeToCode5 } = require("./scanErrorCodes");
  const receipt =
    buildScanReceipt({
      requestId,
      cacheKey,
      mode:
        "grounding_rejected",
      telemetry,
      groundingCause:
        cause,
      // User-facing failure code (locked 2026-10-07): model refusals and
      // empty-grounding blinks both surface as 30101.
      failureCode5:
        causeToCode5(cause === "model_refused" || cause === "blink" ? "grounding_rejected" : cause),
    });

  await createScanReceipt(
    db,
    requestId,
    receipt,
    serverTimestamp()
  );

  return receipt;
}

module.exports = {
  recordReuseAccounting,
  recordFreshAccounting,
  recordGroundingRejectedAccounting,
};

/**
 * @file functions/scanBusinessLedgerStore.js
 * @class Class 1
 * @cap 150 Lines
 * @responsibility Persist immutable T07 scan investigations and request receipts.
 * @dependencies Firestore database instance supplied by caller.
 * @security_gate Accounting/archive persistence only. Never affects scoring, identity, cache reuse, or report contents.
 * @owner_context 411 Scanner T07 Business Center permanent ledger.
 *
 * T07 storage boundary:
 * scan_investigations records one actual AI research event.
 * scan_receipts records one scanner request, including zero-AI Cache Bank reuse.
 *
 * Firestore create() is deliberate. Historical accounting records are
 * append-only and must never be silently replaced by later requests.
 */

const INVESTIGATION_COLLECTION =
  "scan_investigations";

const RECEIPT_COLLECTION =
  "scan_receipts";

/**
 * Treat a repeated immutable identifier as an idempotent success.
 *
 * This protects against harmless request retries without granting
 * permission to mutate an existing accounting record.
 */
function isAlreadyExists(error) {
  return (
    error?.code === 6 ||
    error?.code === "already-exists" ||
    error?.code === "ALREADY_EXISTS"
  );
}

/**
 * Persist one actual Gemini investigation.
 *
 * reportSnapshot and telemetry preserve exactly what 411 knew and
 * what the provider reported when the research occurred.
 */
async function createScanInvestigation(
  db,
  investigationId,
  {
    requestId,
    cacheKey,
    mode,
    reportSnapshot,
    telemetry,
    composition = null,
    solicitationIdentityKey = null,
  },
  createdAt
) {
  if (!investigationId) {
    return null;
  }

  const ref = db
    .collection(INVESTIGATION_COLLECTION)
    .doc(investigationId);

  try {
    await ref.create({
      schemaVersion: "t07-v1",
      investigationId,
      requestId: requestId || null,
      operation: "scan",
      mode: mode || "unknown",
      cacheKey: cacheKey || null,
      solicitationIdentityKey:
        solicitationIdentityKey || null,
      createdAt,
      reportSnapshot: reportSnapshot || {},
      telemetry: telemetry || {},
      composition,
    });

    return investigationId;
  } catch (error) {
    if (isAlreadyExists(error)) {
      return investigationId;
    }

    console.warn(
      "411 Scanner investigation ledger write failed:",
      error
    );

    return null;
  }
}

/**
 * Persist one request receipt.
 *
 * Receipt persistence is separate from Cache Bank storage so reused
 * intelligence cannot masquerade as newly incurred AI cost.
 */
async function createScanReceipt(
  db,
  requestId,
  receipt,
  createdAt
) {
  if (!requestId || !receipt) {
    return null;
  }

  const ref = db
    .collection(RECEIPT_COLLECTION)
    .doc(requestId);

  try {
    await ref.create({
      ...receipt,
      createdAt,
    });

    return requestId;
  } catch (error) {
    if (isAlreadyExists(error)) {
      return requestId;
    }

    console.warn(
      "411 Scanner receipt ledger write failed:",
      error
    );

    return null;
  }
}

module.exports = {
  createScanInvestigation,
  createScanReceipt,
};

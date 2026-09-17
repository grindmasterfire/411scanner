/**
 * @file functions/scanLedgerIds.js
 * @class Class 1
 * @cap 150 Lines
 * @responsibility Generate unique identifiers for T07 request receipts and AI investigations.
 * @dependencies node:crypto
 * @security_gate Identifiers carry no diagnostic, identity, scoring, or cache-reuse authority.
 * @owner_context 411 Scanner T07 Business Center ledger identity.
 *
 * T07 identity rule:
 * A request and an investigation are different economic events.
 *
 * Every scan request receives a requestId.
 * Only a request that actually invokes Gemini receives an investigationId.
 *
 * Multiple Cache Bank receipts may therefore reference one original
 * investigation without duplicating its AI research cost.
 */

const {
  randomUUID,
} = require("node:crypto");

const REQUEST_PREFIX =
  "scanreq_";

const INVESTIGATION_PREFIX =
  "scaninv_";

/**
 * Create a unique immutable request-ledger identifier.
 */
function createScanRequestId() {
  return (
    REQUEST_PREFIX +
    randomUUID()
  );
}

/**
 * Create a unique immutable AI-investigation identifier.
 */
function createScanInvestigationId() {
  return (
    INVESTIGATION_PREFIX +
    randomUUID()
  );
}

module.exports = {
  createScanRequestId,
  createScanInvestigationId,
};

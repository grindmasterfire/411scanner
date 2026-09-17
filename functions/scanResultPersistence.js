/**
 * @file functions/scanResultPersistence.js
 * @class Class 2
 * @cap 250 Lines
 * @responsibility Persist a fresh grounded scan into confirmed identity history, mutable state history, and Cache Bank.
 * @dependencies ./cacheEntryMetadata, ./solicitationState,
 *               ./solicitationIdentity, ./solicitationStateStore,
 *               ./cacheEntryStore
 * @security_gate Persistence follows the grounded current report only; OCR and solicitation patterns never establish permanent identity.
 * @owner_context 411 Scanner fresh-scan archival and continuity.
 *
 * @architecture_note
 * Post-Gemini persistence is isolated from scanWorkflow.js so that
 * orchestration remains readable and has room for T04 research-context
 * decisions without accumulating storage responsibilities.
 */

/**
 * Extract grounded solicitation identity fields emitted by the
 * authoritative current scan.
 *
 * Mutable path/mechanic fields remain available for state versioning.
 * solicitationIdentityKey.js independently decides which durable
 * anchors are strong enough for permanent identity continuity.
 */
function extractSolicitationIdentity(report) {
  const identity =
    report?.solicitation_identity;

  if (
    !identity ||
    typeof identity !== "object"
  ) {
    return null;
  }

  return {
    canonicalName:
      identity.canonical_name || null,
    operator:
      identity.operator || null,
    destinationDomain:
      identity.destination_domain || null,
    destinationPath:
      identity.destination_path || null,
    offerMechanic:
      identity.offer_mechanic || null,
    confidence:
      identity.confidence || "unknown",
  };
}

const {
  buildCacheEntryMetadata,
} = require("./cacheEntryMetadata");

const {
  buildSolicitationState,
} = require("./solicitationState");

const {
  buildSolicitationIdentityKey,
  getSolicitationHistory,
  saveSolicitationHistory,
} = require("./solicitationIdentity");

const {
  saveSolicitationState,
} = require("./solicitationStateStore");

const {
  setCachedScanEntry,
} = require("./cacheEntryStore");

/**
 * Archive one newly grounded current scan.
 *
 * serverTimestamp is injected by the caller so Firebase Admin
 * initialization remains outside this persistence module.
 */
async function persistFreshScanResult(
  db,
  serverTimestamp,
  {
    cacheKey,
    report,
    telemetry,
    ocrText,
  }
) {
  /*
   * solicitation_pattern is deliberately absent here.
   * Pattern similarity never establishes actor identity.
   */
  const solicitationIdentity =
    extractSolicitationIdentity(
      report
    );

  let identityKey =
    null;

  let identityHistory =
    null;

  if (solicitationIdentity) {
    identityKey =
      buildSolicitationIdentityKey(
        solicitationIdentity
      );
  }

  /*
   * Metadata is built only from the completed grounded report.
   * OCR remains a retrieval clue and cannot manufacture identity.
   */
  const cacheMetadata =
    buildCacheEntryMetadata(
      report,
      ocrText,
      identityKey
    );

  if (identityKey) {
    /*
     * Read the previous parent before mutation so callers receive
     * continuity that existed before the current scan.
     */
    identityHistory =
      await getSolicitationHistory(
        db,
        identityKey
      );

    /*
     * solicitation history expects the state fingerprint before its
     * server timestamp. Keeping this order correct preserves both the
     * parent's current-state pointer and its actual last-seen clock.
     */
    await saveSolicitationHistory(
      db,
      identityKey,
      solicitationIdentity,
      cacheKey,
      cacheMetadata.stateFingerprint,
      serverTimestamp()
    );

    /*
     * Mutable offer/path/pricing/mechanic changes belong in state
     * versions beneath the permanent solicitation identity.
     */
    await saveSolicitationState(
      db,
      identityKey,
      cacheMetadata.stateFingerprint,
      buildSolicitationState(
        report
      ),
      report,
      cacheKey,
      serverTimestamp()
    );
  }

  await setCachedScanEntry(
    db,
    cacheKey,
    report,
    serverTimestamp(),
    telemetry,
    cacheMetadata
  );

  return {
    solicitationIdentity,
    identityHistory,
    identityKey,
    cacheMetadata,
  };
}

module.exports = {
  persistFreshScanResult,
};

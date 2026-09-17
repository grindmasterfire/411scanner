/**
 * @file functions/historicalResearchContext.js
 * @class Class 1
 * @cap 150 Lines
 * @responsibility Resolve trusted historical continuity and load its bounded evidence packet for a fresh scan.
 * @dependencies ./historicalIdentityResolver, ./historicalEvidence
 * @security_gate Historical context may guide current research only; it never authorizes stale report reuse or establishes new identity.
 * @owner_context 411 Scanner T04 historical research orchestration.
 *
 * @architecture_note
 * This module is the narrow bridge between identity continuity and
 * historical evidence retrieval.
 *
 * The identity resolver decides whether prior continuity is strong
 * enough to consult. The evidence reader then returns only sanitized
 * historical research ingredients.
 *
 * Failure is soft because history is an optimization. A current scan
 * must still proceed when no trusted history exists or retrieval fails.
 */

const {
  resolveHistoricalIdentity,
} = require("./historicalIdentityResolver");

const {
  getHistoricalEvidencePacket,
} = require("./historicalEvidence");

/**
 * Resolve and load optional historical research context for a scan
 * that already failed current Cache Bank reuse.
 */
async function getHistoricalResearchContext(
  db,
  exactEntry,
  ocrText,
  currentCacheKey
) {
  const continuity =
    await resolveHistoricalIdentity(
      db,
      exactEntry,
      ocrText,
      currentCacheKey
    );

  if (
    !continuity ||
    !continuity.identityKey
  ) {
    return {
      continuity: null,
      evidencePacket: null,
    };
  }

  const evidencePacket =
    await getHistoricalEvidencePacket(
      db,
      continuity.identityKey
    );

  if (!evidencePacket) {
    return {
      continuity,
      evidencePacket: null,
    };
  }

  return {
    continuity,
    evidencePacket,
  };
}

module.exports = {
  getHistoricalResearchContext,
};

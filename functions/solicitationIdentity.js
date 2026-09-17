/**
 * @file functions/solicitationIdentity.js
 * @class Class 1
 * @cap 150 Lines
 * @responsibility Preserve the solicitation identity API while delegating key policy and history persistence.
 * @dependencies ./solicitationIdentityKey, ./solicitationHistoryStore
 * @security_gate Only confirmed grounded identity data may produce a permanent identity key.
 * @owner_context 411 Scanner historical solicitation continuity boundary.
 */

const {
  buildSolicitationIdentityKey,
} = require("./solicitationIdentityKey");

const {
  getSolicitationHistory: readSolicitationHistory,
  saveSolicitationHistory: persistSolicitationHistory,
} = require("./solicitationHistoryStore");

async function getSolicitationHistory(
  db,
  solicitationIdentity
) {
  return readSolicitationHistory(
    db,
    solicitationIdentity
  );
}

async function saveSolicitationHistory(
  db,
  solicitationIdentity,
  identity,
  cacheKey,
  serverTimestamp,
  stateFingerprint = null
) {
  // stateFingerprint is intentionally last so existing callers
  // using the legacy five-argument contract remain valid while
  // index.js is migrated to explicit state-version persistence.
  return persistSolicitationHistory(
    db,
    solicitationIdentity,
    identity,
    cacheKey,
    stateFingerprint,
    serverTimestamp
  );
}

module.exports = {
  buildSolicitationIdentityKey,
  getSolicitationHistory,
  saveSolicitationHistory,
};

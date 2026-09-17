/**
 * @file functions/cacheLayer.js
 * @class Class 1
 * @cap 150 Lines
 * @responsibility Preserve the Cache Bank public API while delegating key generation and persistence to atomic modules.
 * @dependencies ./cacheKey, ./cacheEntryStore
 * @security_gate Compatibility facade only. Contains no identity, freshness, matching, or scoring policy.
 * @owner_context 411 Scanner production Cache Bank API boundary.
 */

const {
  buildCacheKey,
} = require("./cacheKey");

const {
  getCachedScanEntry,
  recordCacheHit,
  setCachedScanEntry,
} = require("./cacheEntryStore");

async function getCachedScanReport(
  db,
  cacheKey
) {
  const entry =
    await getCachedScanEntry(
      db,
      cacheKey
    );

  return entry?.report || null;
}

async function setCachedScanReport(
  db,
  cacheKey,
  report,
  serverTimestamp,
  telemetry = null,
  metadata = {}
) {
  return setCachedScanEntry(
    db,
    cacheKey,
    report,
    serverTimestamp,
    telemetry,
    metadata
  );
}

module.exports = {
  buildCacheKey,
  getCachedScanEntry,
  getCachedScanReport,
  recordCacheHit,
  setCachedScanReport,
};

/**
 * @file functions/cacheFreshness.js
 * @class Class 1
 * @cap 150 Lines
 * @responsibility Build and evaluate Cache Bank freshness timestamps.
 * @dependencies ./cacheFreshnessPolicy
 * @security_gate Freshness controls reuse only. It never establishes identity, evidence, or Action Meter.
 * @owner_context 411 Scanner Cache Bank current-state protection.
 */

const {
  inferFreshnessClass,
  getFreshnessWindowMs,
} = require("./cacheFreshnessPolicy");

function toMillis(value) {
  if (!value) return null;

  if (typeof value.toMillis === "function") {
    return value.toMillis();
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === "number") {
    return value;
  }

  const parsed = Date.parse(value);

  return Number.isNaN(parsed)
    ? null
    : parsed;
}

function buildFreshnessMetadata(
  report,
  nowMs = Date.now()
) {
  const freshnessClass =
    inferFreshnessClass(report);

  const ttlMs =
    getFreshnessWindowMs(freshnessClass);

  return {
    freshnessClass,
    lastVerifiedAt: new Date(nowMs),
    freshUntil: new Date(nowMs + ttlMs),
  };
}

function isCacheEntryFresh(
  cacheEntry,
  nowMs = Date.now()
) {
  const freshUntilMs =
    toMillis(cacheEntry?.freshUntil);

  return (
    freshUntilMs !== null &&
    freshUntilMs > nowMs
  );
}

module.exports = {
  buildFreshnessMetadata,
  isCacheEntryFresh,
};

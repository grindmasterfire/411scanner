/**
 * @file functions/cacheKey.js
 * @class Class 1
 * @cap 150 Lines
 * @responsibility Build deterministic exact-image Cache Bank keys.
 * @dependencies crypto
 * @security_gate Exact-image hashing establishes cache identity only and never solicitation identity.
 * @owner_context 411 Scanner exact Cache Bank identity.
 */

const crypto = require("crypto");

function buildCacheKey(imageBase64) {
  // OCR is deliberately excluded from the exact cache key.
  // Recognition output can vary between devices or ML versions,
  // while identical image bytes must always resolve to one key.
  return crypto
    .createHash("sha256")
    .update(imageBase64 || "")
    .digest("hex");
}

module.exports = {
  buildCacheKey,
};

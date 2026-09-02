/**
 * @file: functions/cacheLayer.js
 * @class: Class 1 (Hooks, Helpers, & Constants)
 * @cap: 150 Lines
 * @responsibility: Build scan cache identities and persist production reports with Gemini telemetry.
 * @dependencies: crypto, firebase-admin
 * @security_gate: Cache persistence only. Does not calculate scores or invoke Gemini.
 * @owner_context: 411 Scanner production cache and calibration telemetry.
 */

const crypto = require("crypto");

/**
 * Builds a deterministic SHA-256 cache key from base64 image data and optional OCR tokens.
 * @param {string} imageBase64
 * @param {Array<string>|string} [ocrTokens]
 * @returns {string} SHA-256 hex digest
 */
function buildCacheKey(imageBase64, ocrTokens) {
  const hash = crypto.createHash("sha256");
  hash.update(imageBase64 || "");
  if (Array.isArray(ocrTokens) && ocrTokens.length > 0) {
    hash.update(
      "::OCR::" +
        ocrTokens
          .map(t => String(t).trim().toLowerCase())
          .sort()
          .join("|")
    );
  } else if (typeof ocrTokens === "string" && ocrTokens.trim()) {
    hash.update("::OCR::" + ocrTokens.trim().toLowerCase());
  }
  return hash.digest("hex");
}

/**
 * Reads a cached diagnostic report from Firestore.
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} cacheKey
 * @returns {Promise<object|null>} Cached report or null
 */
async function getCachedScanReport(db, cacheKey) {
  try {
    const cacheDoc = await db.collection("scan_cache").doc(cacheKey).get();
    if (cacheDoc.exists) {
      const cachedData = cacheDoc.data();
      if (cachedData && cachedData.report) {
        return cachedData.report;
      }
    }
    return null;
  } catch (cacheErr) {
    console.warn("411 Scanner cache read failed, falling back to Gemini:", cacheErr);
    return null;
  }
}

/**
 * Writes a newly generated diagnostic report to the Firestore scan_cache.
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} cacheKey
 * @param {object} report
 * @param {FirebaseFirestore.FieldValue} serverTimestamp
 * @param {object|null} telemetry
 */
async function setCachedScanReport(
  db,
  cacheKey,
  report,
  serverTimestamp,
  telemetry = null
) {
  try {
    await db.collection("scan_cache").doc(cacheKey).set({
      report: report,
      cacheKey: cacheKey,
      timestamp: serverTimestamp,
      telemetry: telemetry
    });
  } catch (cacheWriteErr) {
    console.warn("411 Scanner cache write failed:", cacheWriteErr);
  }
}

module.exports = {
  buildCacheKey,
  getCachedScanReport,
  setCachedScanReport
};
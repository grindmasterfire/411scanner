/**
 * @file: functions/deepDiveCacheLayer.js
 * @class: Class 1 (Hooks, Helpers, & Constants)
 * @cap: 150 Lines
 * @responsibility: Read and persist Deep Dive results within the existing Cache Bank record.
 * @dependencies: firebase-admin
 * @security_gate: Cache persistence only. Does not calculate scores or invoke Gemini.
 * @owner_context: 411 Scanner production Deep Dive Cache Bank continuity.
 */

const admin = require("firebase-admin");

/*
 * 2 = 2026-10-15: SOURCES from Google Search grounding; pattern Deep Dive
 * (how it works, history, what to do, support) when the actor is unnamed.
 */
const DEEP_DIVE_STANDARD = 2;

/**
 * Stores a completed Deep Dive and its Gemini telemetry on the existing
 * scan_cache record rather than creating a separate cache identity.
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} cacheKey
 * @param {string} deepDive
 * @param {object|null} telemetry
 */
async function setCachedDeepDive(
  db,
  cacheKey,
  deepDive,
  telemetry = null
) {
  try {
    await db.collection("scan_cache").doc(cacheKey).set(
      {
        deepDive: deepDive,
        deepDiveTelemetry: telemetry
      },
      { merge: true }
    );
  } catch (cacheWriteErr) {
    console.warn("411 Scanner Deep Dive cache write failed:", cacheWriteErr);
  }
}

/**
 * Reads a previously generated Deep Dive from the existing scan cache record.
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} cacheKey
 * @returns {Promise<object|null>} Cached Deep Dive payload or null
 */
async function getCachedDeepDive(db, cacheKey) {
  try {
    const cacheDoc = await db.collection("scan_cache").doc(cacheKey).get();

    if (!cacheDoc.exists) {
      return null;
    }

    const cachedData = cacheDoc.data() || {};

    if (typeof cachedData.deepDive !== "string") {
      return null;
    }

    // Dives made before the current standard (grounded SOURCES, pattern
    // mode for unnamed actors) are regenerated, not resold.
    if (
      Number(cachedData.deepDiveTelemetry?.deepDiveStandard || 0) <
      DEEP_DIVE_STANDARD
    ) {
      return null;
    }

    return {
      text: cachedData.deepDive,
      telemetry: cachedData.deepDiveTelemetry || null
    };
  } catch (cacheErr) {
    console.warn(
      "411 Scanner Deep Dive cache read failed:",
      cacheErr
    );
    return null;
  }
}

module.exports = {
  DEEP_DIVE_STANDARD,
  setCachedDeepDive,
  getCachedDeepDive
};
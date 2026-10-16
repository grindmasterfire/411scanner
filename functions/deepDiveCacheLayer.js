/**
 * @file: functions/deepDiveCacheLayer.js
 * @class: Class 1 (Hooks, Helpers, & Constants)
 * @cap: 150 Lines
 * @responsibility: Read and persist Deep Dive results within the existing Cache Bank record.
 * @dependencies: crypto
 * @security_gate: Cache persistence only. Does not calculate scores or invoke Gemini.
 * @owner_context: 411 Scanner production Deep Dive Cache Bank continuity.
 */

const crypto = require("crypto");

/*
 * 2 = 2026-10-15: SOURCES from Google Search grounding; pattern Deep Dive
 * (how it works, history, what to do, support) when the actor is unnamed.
 * 3 = 2026-10-16: one dive per finding, stored under deepDives.<diveKey>
 * keyed on (cacheKey, targetName, findingId), so several dives on one base
 * scan (DEEP_DIVE_SPEC.md decision 1, one credit each) never collide or
 * overwrite each other. Older whole-target dives are regenerated, not resold.
 */
const DEEP_DIVE_STANDARD = 3;

/** Firestore-safe map key for one dive on one scan. */
function diveKeyFor(cacheKey, targetName, findingId) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify([String(cacheKey), String(targetName || ""), String(findingId || "")]))
    .digest("hex")
    .slice(0, 32);
}

/**
 * Stores a completed Deep Dive and its Gemini telemetry on the existing
 * scan_cache record rather than creating a separate cache identity.
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} cacheKey
 * @param {string} targetName
 * @param {string} findingId
 * @param {string} deepDive
 * @param {object|null} telemetry
 */
async function setCachedDeepDive(
  db,
  cacheKey,
  targetName,
  findingId,
  deepDive,
  telemetry = null
) {
  try {
    await db.collection("scan_cache").doc(cacheKey).set(
      {
        deepDives: {
          [diveKeyFor(cacheKey, targetName, findingId)]: {
            targetName: String(targetName || ""),
            findingId: String(findingId || ""),
            text: deepDive,
            telemetry,
          },
        },
      },
      { merge: true }
    );
  } catch (cacheWriteErr) {
    console.warn("411 Scanner Deep Dive cache write failed:", cacheWriteErr);
  }
}

/**
 * Reads a previously generated Deep Dive on this finding from the scan cache.
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} cacheKey
 * @param {string} targetName
 * @param {string} findingId
 * @returns {Promise<object|null>} Cached Deep Dive payload or null
 */
async function getCachedDeepDive(db, cacheKey, targetName, findingId) {
  try {
    const cacheDoc = await db.collection("scan_cache").doc(cacheKey).get();

    if (!cacheDoc.exists) {
      return null;
    }

    const dives = (cacheDoc.data() || {}).deepDives || {};
    const cached = dives[diveKeyFor(cacheKey, targetName, findingId)];

    if (!cached || typeof cached.text !== "string") {
      return null;
    }

    if (
      Number(cached.telemetry?.deepDiveStandard || 0) <
      DEEP_DIVE_STANDARD
    ) {
      return null;
    }

    return {
      text: cached.text,
      telemetry: cached.telemetry || null
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
  diveKeyFor,
  setCachedDeepDive,
  getCachedDeepDive
};

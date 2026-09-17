/**
 * @file functions/cacheEntryStore.js
 * @class Class 1
 * @cap 150 Lines
 * @responsibility Read, write, query, and record usage telemetry for Cache Bank entries.
 * @dependencies firebase-admin/firestore
 * @security_gate Persistence only. Does not determine identity, freshness, match strength, or Action Meter.
 * @owner_context 411 Scanner production Cache Bank storage.
 */

const {
  FieldValue,
} = require("firebase-admin/firestore");

async function getCachedScanEntry(db, cacheKey) {
  try {
    const snapshot = await db
      .collection("scan_cache")
      .doc(cacheKey)
      .get();

    if (!snapshot.exists) {
      return null;
    }

    const entry = snapshot.data();

    return entry?.report
      ? entry
      : null;
  } catch (error) {
    console.warn(
      "411 Scanner cache read failed:",
      error
    );
    return null;
  }
}

async function findCacheCandidates(
  db,
  ocrTokens,
  maxResults = 20
) {
  const queryTokens = [...new Set(ocrTokens || [])]
    .filter((token) => String(token).length >= 4)
    .slice(0, 10);

  if (!queryTokens.length) {
    return [];
  }

  try {
    // Retrieval narrows the search space only. Shared OCR
    // tokens never authorize reuse; the matcher owns that gate.
    const snapshot = await db
      .collection("scan_cache")
      .where(
        "ocrTokens",
        "array-contains-any",
        queryTokens
      )
      .limit(maxResults)
      .get();

    return snapshot.docs
      .map((doc) => doc.data())
      .filter((entry) => entry?.report);
  } catch (error) {
    console.warn(
      "411 Scanner cache candidate query failed:",
      error
    );
    return [];
  }
}

async function recordCacheHit(db, cacheKey) {
  try {
    await db
      .collection("scan_cache")
      .doc(cacheKey)
      .update({
        hitCount: FieldValue.increment(1),
        lastServedAt:
          FieldValue.serverTimestamp(),
      });
  } catch (error) {
    console.warn(
      "411 Scanner cache hit telemetry failed:",
      error
    );
  }
}

async function setCachedScanEntry(
  db,
  cacheKey,
  report,
  serverTimestamp,
  telemetry = null,
  metadata = {}
) {
  try {
    await db
      .collection("scan_cache")
      .doc(cacheKey)
      .set({
        report,
        cacheKey,
        timestamp: serverTimestamp,
        telemetry,
        ...metadata,

        // increment(0) initializes a new entry at zero while
        // preserving an existing entry's lifetime hit count.
        hitCount: FieldValue.increment(0),
      }, {
        // Refreshing intelligence must not erase usage history
        // such as lastServedAt gathered for later economics QA.
        merge: true,
      });
  } catch (error) {
    console.warn(
      "411 Scanner cache write failed:",
      error
    );
  }
}

module.exports = {
  getCachedScanEntry,
  findCacheCandidates,
  recordCacheHit,
  setCachedScanEntry,
};

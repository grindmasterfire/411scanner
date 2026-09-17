/**
 * @file functions/solicitationHistoryStore.js
 * @class Class 1
 * @cap 150 Lines
 * @responsibility Persist and retrieve the stable parent record for a confirmed solicitation identity.
 * @dependencies None.
 * @security_gate History persistence never establishes identity or authorizes cached-report reuse.
 * @owner_context 411 Scanner stable solicitation continuity.
 */

async function getSolicitationHistory(
  db,
  identityKey
) {
  if (!identityKey) {
    return null;
  }

  try {
    const snapshot = await db
      .collection("solicitation_history")
      .doc(identityKey)
      .get();

    return snapshot.exists
      ? snapshot.data()
      : null;
  } catch (error) {
    console.warn(
      "411 Scanner solicitation history read failed:",
      error
    );

    return null;
  }
}

async function saveSolicitationHistory(
  db,
  identityKey,
  identity,
  cacheKey,
  stateFingerprint,
  serverTimestamp
) {
  if (!identityKey || !identity) {
    return null;
  }

  try {
    const ref = db
      .collection("solicitation_history")
      .doc(identityKey);

    // Keep the legacy field meanings intact so older readers
    // continue to understand the parent record during migration.
    await ref.set({
      solicitationIdentity: identityKey,
      identity,
      identityKey,

      // The parent points at the latest observed state, while
      // immutable state versions live in the /states subcollection.
      currentStateFingerprint:
        stateFingerprint || null,
      lastSeenCacheKey:
        cacheKey || null,
      lastSeenAt:
        serverTimestamp,
    }, {
      merge: true,
    });

    return identityKey;
  } catch (error) {
    console.warn(
      "411 Scanner solicitation history write failed:",
      error
    );

    return null;
  }
}

module.exports = {
  getSolicitationHistory,
  saveSolicitationHistory,
};

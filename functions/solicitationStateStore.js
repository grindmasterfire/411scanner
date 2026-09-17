/**
 * @file functions/solicitationStateStore.js
 * @class Class 1
 * @cap 150 Lines
 * @responsibility Persist versioned solicitation states beneath a stable solicitation identity.
 * @dependencies None.
 * @security_gate State history records change over time but never establishes actor identity or cache reuse authority.
 * @owner_context 411 Scanner historical solicitation state archive.
 */

async function saveSolicitationState(
  db,
  identityKey,
  stateFingerprint,
  state,
  report,
  cacheKey,
  serverTimestamp
) {
  if (
    !identityKey ||
    !stateFingerprint
  ) {
    return null;
  }

  try {
    const stateRef = db
      .collection("solicitation_history")
      .doc(identityKey)
      .collection("states")
      .doc(stateFingerprint);

    await db.runTransaction(
      async (transaction) => {
        const snapshot =
          await transaction.get(stateRef);

        const record = {
          stateFingerprint,
          state,
          cacheKey: cacheKey || null,
          lastSeenAt: serverTimestamp,

          // Preserve the grounded report that produced this
          // state so later historical-evidence work can inspect
          // what was actually known at that point in time.
          reportSnapshot: report,
        };

        if (!snapshot.exists) {
          // firstSeenAt belongs to this state version and must
          // never move forward when the same version reappears.
          record.firstSeenAt =
            serverTimestamp;
        }

        transaction.set(
          stateRef,
          record,
          {
            merge: true,
          }
        );
      }
    );

    return stateFingerprint;
  } catch (error) {
    console.warn(
      "411 Scanner solicitation state write failed:",
      error
    );

    return null;
  }
}

async function getSolicitationState(
  db,
  identityKey,
  stateFingerprint
) {
  if (
    !identityKey ||
    !stateFingerprint
  ) {
    return null;
  }

  try {
    const snapshot = await db
      .collection("solicitation_history")
      .doc(identityKey)
      .collection("states")
      .doc(stateFingerprint)
      .get();

    return snapshot.exists
      ? snapshot.data()
      : null;
  } catch (error) {
    console.warn(
      "411 Scanner solicitation state read failed:",
      error
    );

    return null;
  }
}

module.exports = {
  saveSolicitationState,
  getSolicitationState,
};

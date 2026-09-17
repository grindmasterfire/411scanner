/**
 * @file functions/historicalEvidence.js
 * @class Class 1
 * @cap 150 Lines
 * @responsibility Read recent solicitation-state history and assemble bounded historical evidence packets.
 * @dependencies ./historicalEvidenceCompactor
 * @security_gate Reads history only for an already-confirmed identity key; historical context never establishes identity or authorizes report reuse.
 * @owner_context 411 Scanner T04 historical evidence retrieval.
 *
 * @architecture_note
 * Firestore retrieval is intentionally separate from evidence
 * transformation so persistence concerns do not expand the pure
 * historical-evidence compactor.
 *
 * Historical context is an optimization only. Failure to read it
 * must never prevent a fresh current Gemini investigation.
 */

const {
  compactHistoricalState,
} = require("./historicalEvidenceCompactor");

const MAX_STATES = 3;

/**
 * Read the most recently observed archived states for one confirmed
 * permanent solicitation identity.
 *
 * The caller must already possess a trusted identity key. This module
 * never derives identity from OCR, creative similarity, or patterns.
 */
async function getHistoricalEvidencePacket(
  db,
  identityKey
) {
  if (!identityKey) {
    return null;
  }

  try {
    const snapshot =
      await db
        .collection(
          "solicitation_history"
        )
        .doc(identityKey)
        .collection("states")
        .orderBy(
          "lastSeenAt",
          "desc"
        )
        .limit(MAX_STATES)
        .get();

    if (snapshot.empty) {
      return null;
    }

    const states =
      snapshot.docs
        .map((doc) =>
          compactHistoricalState(
            doc.data()
          )
        );

    return {
      identityKey,
      historicalOnly: true,
      stateCount:
        states.length,
      states,
    };
  } catch (error) {
    console.warn(
      "411 Scanner historical evidence read failed:",
      error
    );

    return null;
  }
}

module.exports = {
  getHistoricalEvidencePacket,
};

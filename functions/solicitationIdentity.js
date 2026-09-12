/**
 * @file: functions/solicitationIdentity.js
 * @class: Class 1 (Hooks, Helpers, & Constants)
 * @responsibility: Persist and retrieve grounded historical solicitation identities.
 * @dependencies: firebase-admin
 * @security_gate: Never creates identity claims. Only stores identity data supplied by the grounded scan.
 * @owner_context: 411 Scanner historical solicitation continuity.
 */

function normalizeIdentityValue(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function buildSolicitationIdentityKey(identity) {
  if (!identity || identity.confidence !== "confirmed") {
    return null;
  }

  const anchors = [
    identity.canonicalName,
    identity.operator,
    identity.destinationDomain,
    identity.destinationPath,
    identity.offerMechanic
  ]
    .map(normalizeIdentityValue)
    .filter(Boolean);

  if (anchors.length < 2) {
    return null;
  }

  return anchors.join("::");
}

async function getSolicitationHistory(db, solicitationIdentity) {
  if (!solicitationIdentity) {
    return null;
  }

  try {
    const doc = await db
      .collection("solicitation_history")
      .doc(solicitationIdentity)
      .get();

    if (!doc.exists) {
      return null;
    }

    return doc.data() || null;
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
  solicitationIdentity,
  identity,
  cacheKey,
  serverTimestamp
) {
  if (!solicitationIdentity || !identity) {
    return;
  }

  try {
    const ref = db
      .collection("solicitation_history")
      .doc(solicitationIdentity);

    await ref.set(
      {
        solicitationIdentity,
        identity,
        lastSeenCacheKey: cacheKey,
        lastSeenAt: serverTimestamp
      },
      { merge: true }
    );
  } catch (error) {
    console.warn(
      "411 Scanner solicitation history write failed:",
      error
    );
  }
}

module.exports = {
  buildSolicitationIdentityKey,
  getSolicitationHistory,
  saveSolicitationHistory
};
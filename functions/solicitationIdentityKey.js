/**
 * @file functions/solicitationIdentityKey.js
 * @class Class 1
 * @cap 150 Lines
 * @responsibility Build stable confirmed solicitation identity keys from durable identity anchors.
 * @dependencies crypto
 * @security_gate Identity requires confirmed confidence and at least two durable anchors.
 * @owner_context 411 Scanner historical solicitation continuity.
 */

const crypto = require("crypto");

function normalizeIdentityValue(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function getDurableIdentityAnchors(identity) {
  if (
    !identity ||
    identity.confidence !== "confirmed"
  ) {
    return [];
  }

  return [
    identity.canonicalName,
    identity.operator,
    identity.destinationDomain,
  ]
    .map(normalizeIdentityValue)
    .filter(Boolean);
}

function buildSolicitationIdentityKey(identity) {
  const anchors =
    getDurableIdentityAnchors(identity);

  if (anchors.length < 2) {
    return null;
  }

  const signature =
    anchors.join("::");

  return `identity_${crypto
    .createHash("sha256")
    .update(signature)
    .digest("hex")
    .slice(0, 32)}`;
}

module.exports = {
  normalizeIdentityValue,
  getDurableIdentityAnchors,
  buildSolicitationIdentityKey,
};

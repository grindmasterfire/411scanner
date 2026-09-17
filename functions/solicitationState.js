/**
 * @file functions/solicitationState.js
 * @class Class 1
 * @cap 150 Lines
 * @responsibility Build deterministic material-state fingerprints for solicitation versioning.
 * @dependencies crypto
 * @security_gate State fingerprints describe changing mechanics only and never establish actor identity.
 * @owner_context 411 Scanner Cache Bank solicitation-state history.
 */

const crypto = require("crypto");

function clean(value) {
  return typeof value === "string"
    ? value.trim().toLowerCase().replace(/\s+/g, " ")
    : "";
}

function cleanList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(
    value
      .filter((item) => typeof item === "string")
      .map(clean)
      .filter(Boolean)
  )].sort();
}

function firstValue(...values) {
  return values
    .map(clean)
    .find(Boolean) || "";
}

function buildSolicitationState(report) {
  const identity =
    report?.solicitation_identity || {};

  const pattern =
    report?.solicitation_pattern || {};

  const technical =
    report?.technical_ledger || {};

  const network =
    technical.network_telemetry || {};

  const monetization =
    technical.monetization || {};

  const destinationDomain = firstValue(
    identity.destination_domain,
    identity.destinationDomain,
    network.app_package_or_domain
  );

  const destinationPath = firstValue(
    identity.destination_path,
    identity.destinationPath
  );

  const offerMechanic = firstValue(
    identity.offer_mechanic,
    identity.offerMechanic,
    pattern.offer_or_request
  );

  return {
    destinationDomain,
    destinationPath,
    offerMechanic,
    requestedAction:
      clean(pattern.requested_action),
    mechanics:
      cleanList(pattern.mechanics),
    revenueModel:
      clean(monetization.revenue_model),
    pricing:
      clean(monetization.pricing),
    guaranteeTerms:
      clean(monetization.guarantee_terms),
  };
}

function buildStateFingerprint(report) {
  const state =
    buildSolicitationState(report);

  const signature = [
    state.destinationDomain,
    state.destinationPath,
    state.offerMechanic,
    state.requestedAction,
    ...state.mechanics,
    state.revenueModel,
    state.pricing,
    state.guaranteeTerms,
  ]
    .filter(Boolean)
    .join("|");

  if (!signature) {
    return "";
  }

  return `state_${crypto
    .createHash("sha256")
    .update(signature)
    .digest("hex")
    .slice(0, 24)}`;
}

module.exports = {
  buildSolicitationState,
  buildStateFingerprint,
};

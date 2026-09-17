/**
 * @file functions/cacheEntryMetadata.js
 * @class Class 1
 * @cap 150 Lines
 * @responsibility Build reusable Cache Bank metadata from an already-grounded scan report.
 * @dependencies ./cacheFreshness, ./cacheTextSignals, ./solicitationState
 * @security_gate Metadata describes an existing grounded report and never establishes new identity.
 * @owner_context 411 Scanner Cache Bank persistence metadata.
 */

const {
  buildFreshnessMetadata,
} = require("./cacheFreshness");

const {
  tokenizeText,
  normalizeText,
} = require("./cacheTextSignals");

const {
  buildStateFingerprint,
} = require("./solicitationState");

function clean(value) {
  return normalizeText(value);
}

function buildIdentityAnchors(report) {
  const identity =
    report?.solicitation_identity || {};

  const network =
    report?.technical_ledger
      ?.network_telemetry || {};

  // These are clues copied from the already-grounded report.
  // Their presence never establishes identity for a new scan.
  return [...new Set([
    clean(identity.canonical_name),
    clean(identity.operator),
    clean(identity.destination_domain),
    clean(network.app_package_or_domain),
  ].filter((value) => value.length >= 4))];
}

function choosePrimaryIdentityAnchor(report) {
  const identity =
    report?.solicitation_identity || {};

  const network =
    report?.technical_ledger
      ?.network_telemetry || {};

  // Only a grounded domain/package qualifies for the strong-
  // anchor reuse path. Names and operators are intentionally
  // excluded here because branding alone can be copied.
  return [
    clean(identity.destination_domain),
    clean(network.app_package_or_domain),
  ].find((value) => value.length >= 4) || "";
}

function buildCacheEntryMetadata(
  report,
  ocrText,
  solicitationIdentityKey = null,
  nowMs = Date.now()
) {
  const freshness =
    buildFreshnessMetadata(
      report,
      nowMs
    );

  const identityAnchors =
    buildIdentityAnchors(report);

  return {
    ...freshness,

    // Permanent identity and mutable state remain separate.
    solicitationIdentityKey:
      solicitationIdentityKey || null,
    identityConfidence:
      report?.solicitation_identity
        ?.confidence || "unknown",
    identityAnchors,
    primaryIdentityAnchor:
      choosePrimaryIdentityAnchor(report),
    stateFingerprint:
      buildStateFingerprint(report),

    // Raw OCR is not persisted here. Normalized tokens are
    // sufficient for cheap candidate discovery and comparison.
    ocrTokens:
      tokenizeText(ocrText).slice(0, 80),
  };
}

module.exports = {
  buildIdentityAnchors,
  choosePrimaryIdentityAnchor,
  buildCacheEntryMetadata,
};

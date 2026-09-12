/**
 * 411 SCANNER — T03 Solicitation Pattern Identity
 *
 * Responsibility:
 * Deterministically normalize a Gemini-produced solicitation-pattern
 * finding and derive an archival pattern key.
 *
 * This module does NOT establish actor identity.
 * Pattern similarity is never solicitation_identity.
 */

const crypto = require("crypto");

const PATTERN_ASSESSMENTS = Object.freeze([
  "ordinary",
  "suspicious",
  "deceptive_pattern",
  "insufficient_evidence",
]);

const FOOTPRINT_STATUSES = Object.freeze([
  "established",
  "limited",
  "absent",
  "unknown",
]);

const CONFIDENCE_VALUES = Object.freeze([
  "high",
  "medium",
  "low",
  "unknown",
]);

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanList(value) {
  if (!Array.isArray(value)) return [];

  return [...new Set(
    value
      .filter((item) => typeof item === "string")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  )].sort();
}

function normalizeSolicitationPattern(pattern) {
  const source = pattern && typeof pattern === "object" ? pattern : {};

  const normalized = {
    solicitation_type: clean(source.solicitation_type),
    offer_or_request: clean(source.offer_or_request),
    requested_action: clean(source.requested_action),
    mechanics: cleanList(source.mechanics),
    behavioral_signals: cleanList(source.behavioral_signals),
    footprint_status: FOOTPRINT_STATUSES.includes(source.footprint_status)
      ? source.footprint_status
      : "unknown",
    pattern_assessment: PATTERN_ASSESSMENTS.includes(source.pattern_assessment)
      ? source.pattern_assessment
      : "insufficient_evidence",
    confidence: CONFIDENCE_VALUES.includes(source.confidence)
      ? source.confidence
      : "unknown",
  };

  return {
    ...normalized,
    pattern_key: buildSolicitationPatternKey(normalized),
  };
}

function buildSolicitationPatternKey(pattern) {
  const source = pattern && typeof pattern === "object" ? pattern : {};

  const signature = [
    clean(source.solicitation_type).toLowerCase(),
    clean(source.offer_or_request).toLowerCase(),
    clean(source.requested_action).toLowerCase(),
    ...cleanList(source.mechanics),
    ...cleanList(source.behavioral_signals),
  ]
    .filter(Boolean)
    .join("|");

  if (!signature) return "";

  return `pattern_${crypto
    .createHash("sha256")
    .update(signature)
    .digest("hex")
    .slice(0, 24)}`;
}

module.exports = {
  PATTERN_ASSESSMENTS,
  FOOTPRINT_STATUSES,
  CONFIDENCE_VALUES,
  normalizeSolicitationPattern,
  buildSolicitationPatternKey,
};

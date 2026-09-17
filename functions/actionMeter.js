/**
 * @file functions/actionMeter.js
 * @class Class 3
 * @cap 400 Lines
 * @responsibility Govern server-owned Action Meter synthesis, compatibility, knowledge/consequence baselines, the 8.0 disengagement boundary, Floor Raisers, and canonical verdict resolution.
 * @dependencies ./masterCalibrationRuler, ./actionMeterFloorRaisers,
 *               ./actionMeterBaselines
 * @security_gate Gemini proposes evidence and a synthesized candidate score; server owns minimum placement, warning-boundary authority, Floor-Raiser math, and final verdict.
 * @owner_context 411 Scanner Action Meter authority.
 *
 * Canon:
 * - Six-vector averaging is fallback diagnostic math only.
 * - Model score alone may not cross 7.9.
 * - Knowledge/consequence baselines may establish 5.6, 6.0, or 7.0 minimums.
 * - Evidence-backed consumer disengagement may establish the 8.0 minimum.
 * - Validated Floor Raisers apply afterward and remain additive/uncapped.
 */

const {
  MASTER_CALIBRATION_RULER,
} = require("./masterCalibrationRuler");

const {
  extractFloorRaisers,
  applyFloorRaisers,
} = require("./actionMeterFloorRaisers");

const {
  applyActionMeterBaseline,
} = require("./actionMeterBaselines");

const VERDICT_BADGES = Object.freeze({
  "EVERYBODY": "EVERYBODY",
  "MOSTLY EVERYBODY": "MOSTLY_EVERYBODY",
  "TRIBE": "TRIBE",
  "TRIBE + KNOWLEDGE":
    "TRIBE_PLUS_KNOWLEDGE",
  "NOT FOR EVERYONE":
    "NOT_FOR_EVERYONE",
  "PROFESSIONAL CONSIDERATION ONLY":
    "PROFESSIONAL_CONSIDERATION_ONLY",
  "PASS ON THIS ONE":
    "PASS_ON_THIS_ONE",
  "REMOVE FROM PLATFORM":
    "REMOVE_FROM_PLATFORM",
  "DELETE FROM EARTH":
    "DELETE_FROM_EARTH",
});

function finiteNumber(value) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

function hasEvidence(values) {
  return (
    Array.isArray(values) &&
    values.some(
      (value) =>
        typeof value === "string" &&
        value.trim().length > 0
    )
  );
}

/**
 * Canonical metric names are authoritative for new reports.
 *
 * Legacy names preserve old Cache Bank intelligence during the
 * coordinated server/client migration.
 */
function normalizeMetrics(metrics = {}) {
  return {
    financialRisk:
      finiteNumber(
        metrics.financial_risk
      ) ?? 0,

    personalDataExposure:
      finiteNumber(
        metrics.personal_data_exposure
      ) ?? 0,

    wastedTimeAndAds:
      finiteNumber(
        metrics.wasted_time_and_ads
      ) ?? 0,

    realSubstance:
      finiteNumber(
        metrics.real_substance
      ) ?? 0,

    practicalUtility:
      finiteNumber(
        metrics.practical_utility
      ) ??
      finiteNumber(
        metrics.offline_independence
      ) ??
      0,

    honestBusinessModel:
      finiteNumber(
        metrics.honest_business_model
      ) ??
      finiteNumber(
        metrics.honest_pricing
      ) ??
      0,
  };
}

/**
 * Legacy six-vector composite.
 *
 * This is retained only as a diagnostic fallback when a usable
 * evidence-synthesized candidate score is absent.
 */
function calculateDiagnosticComposite(
  metrics
) {
  const normalized =
    normalizeMetrics(metrics);

  const frictionAverage =
    (
      normalized.financialRisk +
      normalized.personalDataExposure +
      normalized.wastedTimeAndAds
    ) / 3;

  const valueAverage =
    (
      normalized.realSubstance +
      normalized.practicalUtility +
      normalized.honestBusinessModel
    ) / 3;

  return (
    frictionAverage +
    (10 - valueAverage)
  ) / 2;
}

/**
 * Gemini may synthesize a candidate score from the complete evidence,
 * but model output alone cannot create an 8+ consumer warning.
 */
function getGovernedCandidate(
  parsedData
) {
  const card =
    parsedData?.consumer_card || {};

  const proposed =
    finiteNumber(
      card.action_meter_score
    );

  const fallback =
    calculateDiagnosticComposite(
      card.metrics || {}
    );

  const candidate =
    proposed === null
      ? fallback
      : proposed;

  return Math.min(
    Math.max(candidate, 0),
    7.9
  );
}

/**
 * The 8.0 boundary is qualitatively different from ordinary
 * knowledge/consequence placement.
 *
 * The signal must be true AND carry its matching evidence receipt.
 * Runtime grounding gates later ensure accepted fresh intelligence
 * comes only from provider-proven live research.
 */
function hasConsumerDisengagementBoundary(
  parsedData
) {
  const context =
    parsedData
      ?.consumer_card
      ?.action_meter_context || {};

  return (
    context
      .consumer_disengagement_boundary ===
      true &&
    hasEvidence(
      context
        .evidence
        ?.consumer_disengagement_boundary
    )
  );
}

function applyDisengagementBoundary(
  score,
  parsedData
) {
  if (
    !hasConsumerDisengagementBoundary(
      parsedData
    )
  ) {
    return score;
  }

  return Math.max(
    score,
    8.0
  );
}

/**
 * Produce the authoritative server Action Meter.
 *
 * Order is deliberate:
 * 1. evidence-synthesized candidate, bounded at 7.9
 * 2. deterministic knowledge/consequence minimum
 * 3. evidence-backed 8.0 consumer-disengagement boundary
 * 4. validated additive Floor Raisers
 *
 * Knowledge baselines do not stack with one another.
 * Floor Raisers remain independent, stackable, and uncapped.
 */
function calculateScore(
  parsedData,
  floorRaisers = {}
) {
  const candidate =
    getGovernedCandidate(
      parsedData
    );

  const baselineResult =
    applyActionMeterBaseline(
      candidate,
      parsedData
    );

  const boundaryScore =
    applyDisengagementBoundary(
      baselineResult.score,
      parsedData
    );

  const finalScore =
    applyFloorRaisers(
      boundaryScore,
      floorRaisers
    );

  return Math.round(
    finalScore * 10
  ) / 10;
}

function getVerdict(score) {
  const bands =
    MASTER_CALIBRATION_RULER
      .actionMeterBands;

  const matchedBand =
    bands.find(
      (band) =>
        score >= band.min &&
        (
          band.max === null ||
          score <= band.max
        )
    ) ||
    bands[bands.length - 1];

  return {
    badge:
      VERDICT_BADGES[
        matchedBand.label
      ] ||
      "DELETE_FROM_EARTH",

    label:
      matchedBand.label,
  };
}

module.exports = {
  calculateDiagnosticComposite,
  calculateScore,
  extractFloorRaisers,
  getVerdict,
  hasConsumerDisengagementBoundary,
};

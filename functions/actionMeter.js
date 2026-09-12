/**
 * @file functions/actionMeter.js
 * @class Class 1
 * @cap 150 Lines
 * @responsibility Orchestrate server-owned Action Meter synthesis and canonical verdict resolution.
 * @dependencies ./masterCalibrationRuler, ./actionMeterFloorRaisers
 * @security_gate Gemini never controls the final score, numerical Floor-Raiser effects, or final verdict.
 * @owner_context 411 Scanner server-owned Action Meter.
 */

const {
  MASTER_CALIBRATION_RULER,
} = require("./masterCalibrationRuler");

const {
  extractFloorRaisers,
  applyFloorRaisers,
} = require("./actionMeterFloorRaisers");

/**
 * Maps canonical ruler labels to stable machine-readable badges.
 *
 * Human-facing verdict labels remain authoritative in the
 * Master Calibration Ruler.
 */
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

/**
 * Calculates the six-vector base composite.
 *
 * V1 compatibility fields:
 * offline_independence = Practical Utility
 * honest_pricing = Honest Business Model
 *
 * The compatibility names remain here until the coordinated
 * schema/server/client migration changes the wire contract.
 */
function calculateBaseComposite(metrics) {
  const frictionAverage =
    (
      metrics.financial_risk +
      metrics.personal_data_exposure +
      metrics.wasted_time_and_ads
    ) / 3;

  const valueAverage =
    (
      metrics.real_substance +
      metrics.offline_independence +
      metrics.honest_pricing
    ) / 3;

  return (
    frictionAverage +
    (10 - valueAverage)
  ) / 2;
}

/**
 * Produces the authoritative server score.
 *
 * Gemini supplies diagnostic evidence and qualitative triggers.
 * The server owns composite synthesis and numerical
 * Floor-Raiser application.
 */
function calculateScore(
  metrics,
  floorRaisers = {}
) {
  const baseScore =
    calculateBaseComposite(metrics);

  const finalScore =
    applyFloorRaisers(
      baseScore,
      floorRaisers
    );

  return Math.round(
    finalScore * 10
  ) / 10;
}

/**
 * Resolves the final score against the canonical calibration ruler.
 *
 * Scores above the final bounded band fall through to the
 * uncapped DELETE FROM EARTH band.
 */
function getVerdict(score) {
  const bands =
    MASTER_CALIBRATION_RULER.actionMeterBands;

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
      VERDICT_BADGES[matchedBand.label] ||
      "DELETE_FROM_EARTH",

    label:
      matchedBand.label,
  };
}

module.exports = {
  calculateScore,
  extractFloorRaisers,
  getVerdict,
};
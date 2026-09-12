/**
 * @file functions/actionMeterFloorRaisers.js
 * @class Class 1
 * @cap 150 Lines
 * @responsibility Extract qualitative Floor-Raiser triggers and apply their server-owned numerical effects.
 * @dependencies None.
 * @security_gate Gemini identifies qualitative triggers only. The server owns numerical Floor-Raiser application.
 * @owner_context 411 Scanner server-owned Action Meter Floor-Raiser governance.
 */

/**
 * Extracts the evidence-dependent Floor-Raiser flags from the
 * validated Gemini report.
 *
 * Only explicit boolean true values activate a trigger.
 * Missing, false, or non-boolean values do not activate one.
 */
function extractFloorRaisers(parsedData) {
  const source =
    parsedData?.consumer_card?.floor_raisers || {};

  return {
    rebrandPattern:
      source.rebrand_pattern === true,

    advanceFee:
      source.advance_fee === true,

    federalImpersonation:
      source.federal_impersonation === true,

    confirmedCriminal:
      source.confirmed_criminal === true,

    nearThresholdSuspension:
      source.near_threshold_suspension === true,

    withdrawalGate:
      source.withdrawal_gate === true,
  };
}

/**
 * Applies server-owned numerical effects to the base Action Meter.
 *
 * Independent validated Floor Raisers are stackable and uncapped.
 * This function deliberately does not clamp the resulting score.
 *
 * Numerical effects remain server policy and are never supplied
 * or calculated by Gemini.
 */
function applyFloorRaisers(
  baseScore,
  floorRaisers = {}
) {
  let score = baseScore;

  if (floorRaisers.rebrandPattern) {
    score += 1.0;
  }

  if (floorRaisers.advanceFee) {
    score += 1.0;
  }

  if (floorRaisers.federalImpersonation) {
    score += 1.5;
  }

  if (floorRaisers.confirmedCriminal) {
    score += 2.0;
  }

  if (floorRaisers.nearThresholdSuspension) {
    score += 0.5;
  }

  if (floorRaisers.withdrawalGate) {
    score += 0.5;
  }

  return score;
}

module.exports = {
  extractFloorRaisers,
  applyFloorRaisers,
};
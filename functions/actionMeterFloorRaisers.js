/**
 * @file functions/actionMeterFloorRaisers.js
 * @class Class 1
 * @cap 150 Lines
 * @responsibility Validate qualitative Floor-Raiser triggers and apply server-owned numerical effects.
 * @dependencies None.
 * @security_gate A Gemini trigger is accepted only when its matching evidence bucket contains concrete evidence.
 * @owner_context 411 Scanner server-owned Action Meter Floor-Raiser governance.
 */

/**
 * Returns true only when an evidence bucket contains at least
 * one non-empty evidence statement.
 */
function hasEvidence(evidenceBucket) {
  return (
    Array.isArray(evidenceBucket) &&
    evidenceBucket.some(
      (item) =>
        typeof item === "string" &&
        item.trim().length > 0
    )
  );
}

/**
 * Extracts and validates evidence-dependent Floor-Raiser flags.
 *
 * Gemini may propose boolean triggers, but the server accepts a
 * trigger only when its matching evidence receipt is populated.
 */
function extractFloorRaisers(parsedData) {
  const card =
    parsedData?.consumer_card || {};

  const source =
    card.floor_raisers || {};

  const evidence =
    card.floor_raiser_evidence || {};

  return {
    rebrandPattern:
      source.rebrand_pattern === true &&
      hasEvidence(evidence.rebrand_pattern),

    advanceFee:
      source.advance_fee === true &&
      hasEvidence(evidence.advance_fee),

    federalImpersonation:
      source.federal_impersonation === true &&
      hasEvidence(evidence.federal_impersonation),

    confirmedCriminal:
      source.confirmed_criminal === true &&
      hasEvidence(evidence.confirmed_criminal),

    nearThresholdSuspension:
      source.near_threshold_suspension === true &&
      hasEvidence(evidence.near_threshold_suspension),

    withdrawalGate:
      source.withdrawal_gate === true &&
      hasEvidence(evidence.withdrawal_gate),

    ipHostageLockIn:
      source.ip_hostage_lock_in === true &&
      hasEvidence(evidence.ip_hostage_lock_in),

    adArbitrageMfaLure:
      source.ad_arbitrage_mfa_lure === true &&
      hasEvidence(evidence.ad_arbitrage_mfa_lure),
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

  if (floorRaisers.ipHostageLockIn) {
    score += 0.5;
  }

  if (floorRaisers.adArbitrageMfaLure) {
    score += 0.5;
  }

  return score;
}

module.exports = {
  extractFloorRaisers,
  applyFloorRaisers,
};

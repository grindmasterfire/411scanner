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

    greyMarketCredentialResale:
      source.grey_market_credential_resale === true &&
      hasEvidence(evidence.grey_market_credential_resale),

    credentialHarvesting:
      source.credential_harvesting === true &&
      hasEvidence(evidence.credential_harvesting),

    coordinatedReviewFraud:
      source.coordinated_review_fraud === true &&
      hasEvidence(evidence.coordinated_review_fraud),

    dataBrokerage:
      source.data_brokerage === true &&
      hasEvidence(evidence.data_brokerage),

    subscriptionDarkPatterns:
      source.subscription_dark_patterns === true &&
      hasEvidence(evidence.subscription_dark_patterns),

    recruitmentGatedEarnings:
      source.recruitment_gated_earnings === true &&
      hasEvidence(evidence.recruitment_gated_earnings),

    brandImpersonation:
      source.brand_impersonation === true &&
      hasEvidence(evidence.brand_impersonation),

    extortionMechanics:
      source.extortion_mechanics === true &&
      hasEvidence(evidence.extortion_mechanics),
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

  if (floorRaisers.greyMarketCredentialResale) {
    score += 1.0;
  }

  if (floorRaisers.credentialHarvesting) {
    score += 1.5;
  }

  if (floorRaisers.coordinatedReviewFraud) {
    score += 1.0;
  }

  if (floorRaisers.dataBrokerage) {
    score += 1.0;
  }

  if (floorRaisers.subscriptionDarkPatterns) {
    score += 0.5;
  }

  if (floorRaisers.recruitmentGatedEarnings) {
    score += 1.0;
  }

  if (floorRaisers.brandImpersonation) {
    score += 1.5;
  }

  if (floorRaisers.extortionMechanics) {
    score += 2.0;
  }

  return score;
}

module.exports = {
  extractFloorRaisers,
  applyFloorRaisers,
};

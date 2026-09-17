/**
 * @file functions/groundingCostEstimator.js
 * @class Class 1
 * @cap 150 Lines
 * @responsibility Estimate paid-rate Google Search grounding cost from provider-reported usage.
 * @dependencies ./groundingVerification
 * @security_gate Economics only; search-query text is never persisted or returned.
 * @owner_context 411 Scanner Gemini research economics.
 *
 * Grounding authority belongs to groundingVerification.js.
 * This module consumes the same provider-derived search count so
 * enforcement and accounting cannot disagree about whether searches occurred.
 *
 * A single scan cannot know how much of Google's shared account-level
 * allowance remains, so this reports the paid marginal-rate estimate.
 *
 * T07 persists a 411-owned rate version with each estimate so historical
 * receipts remain auditable after future pricing changes.
 */

const {
  getProviderSearchQueryCount,
} = require("./groundingVerification");

const SEARCHES_PER_PRICE_UNIT =
  1000;

const PRICE_PER_UNIT_USD =
  14;

const GROUNDING_RATE_VERSION =
  "411-google-search-grounding-2026-v1";

/**
 * Estimate Google Search grounding cost at the configured paid rate.
 *
 * The shared account allowance is deliberately not subtracted because
 * one isolated scan cannot know whether that allowance is still available.
 */
function estimateGroundingCost(
  response
) {
  const searchQueryCount =
    getProviderSearchQueryCount(
      response
    );

  const estimatedPaidRateCostUsd =
    (
      searchQueryCount *
      PRICE_PER_UNIT_USD
    ) /
    SEARCHES_PER_PRICE_UNIT;

  return {
    googleSearchQueryCount:
      searchQueryCount,

    estimatedGroundingCostUsdAtPaidRate:
      Number(
        estimatedPaidRateCostUsd
          .toFixed(8)
      ),

    pricing: {
      rateVersion:
        GROUNDING_RATE_VERSION,

      usdPerThousandQueries:
        PRICE_PER_UNIT_USD,

      monthlyFreeAllowanceNotApplied:
        true,

      estimateBasis:
        "paid_marginal_rate",
    },
  };
}

module.exports = {
  estimateGroundingCost,
};

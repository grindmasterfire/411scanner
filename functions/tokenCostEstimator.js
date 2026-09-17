/**
 * @file functions/tokenCostEstimator.js
 * @class Class 1
 * @cap 150 Lines
 * @responsibility Estimate Gemini token charges from returned usage metadata.
 * @dependencies None.
 * @security_gate Cost is telemetry only and never affects diagnostic evidence, scoring, cache reuse, or user conclusions.
 * @owner_context 411 Scanner Gemini economics telemetry.
 *
 * This estimates TOKEN charges only.
 * Google Search grounding and other separately billed services are excluded.
 *
 * T07 persists both the rates and a 411-owned rate version so historical
 * receipts remain auditable after future provider pricing changes.
 */

const MILLION = 1_000_000;

const GEMINI_36_FLASH_RATES = {
  through2026: {
    rateVersion:
      "411-gemini-3.6-flash-standard-2026-v1",
    inputPerMillionUsd: 0.75,
    outputPerMillionUsd: 3.75,
    effectiveThrough: "2026-12-31",
  },

  from2027: {
    rateVersion:
      "411-gemini-3.6-flash-standard-2027-v1",
    inputPerMillionUsd: 1.50,
    outputPerMillionUsd: 7.50,
    effectiveFrom: "2027-01-01",
  },
};

function getGemini36FlashRates(
  date = new Date()
) {
  const boundary =
    new Date("2027-01-01T00:00:00Z");

  return date < boundary
    ? GEMINI_36_FLASH_RATES.through2026
    : GEMINI_36_FLASH_RATES.from2027;
}

/**
 * Gemini thinking tokens are estimated at the configured output rate.
 * Candidate tokens are visible generated output; thought tokens are
 * generated reasoning reported separately by the provider.
 */
function estimateGeminiTokenCost(
  usageMetadata = {},
  date = new Date()
) {
  const rates =
    getGemini36FlashRates(date);

  const inputTokens =
    usageMetadata.promptTokenCount || 0;

  const outputTokens =
    usageMetadata.candidatesTokenCount || 0;

  const thinkingTokens =
    usageMetadata.thoughtsTokenCount || 0;

  const billableOutputTokens =
    outputTokens + thinkingTokens;

  const inputCostUsd =
    (
      inputTokens *
      rates.inputPerMillionUsd
    ) / MILLION;

  const outputCostUsd =
    (
      billableOutputTokens *
      rates.outputPerMillionUsd
    ) / MILLION;

  return {
    estimatedTokenCostUsd:
      Number(
        (
          inputCostUsd +
          outputCostUsd
        ).toFixed(8)
      ),

    estimatedInputCostUsd:
      Number(
        inputCostUsd.toFixed(8)
      ),

    estimatedOutputCostUsd:
      Number(
        outputCostUsd.toFixed(8)
      ),

    billableInputTokens:
      inputTokens,

    billableOutputTokens,

    pricing: {
      rateVersion:
        rates.rateVersion,
      inputPerMillionUsd:
        rates.inputPerMillionUsd,
      outputPerMillionUsd:
        rates.outputPerMillionUsd,
      effectiveFrom:
        rates.effectiveFrom || null,
      effectiveThrough:
        rates.effectiveThrough || null,
      excludes: [
        "Google Search grounding charges",
        "other separately billed services",
      ],
    },
  };
}

module.exports = {
  estimateGeminiTokenCost,
  getGemini36FlashRates,
};

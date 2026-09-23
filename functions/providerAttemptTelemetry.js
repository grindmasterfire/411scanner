/**
 * @file functions/providerAttemptTelemetry.js
 * @class Class 2
 * @cap 200 Lines
 * @responsibility Build forensic telemetry for one Gemini
 * provider attempt.
 * @dependencies ./tokenCostEstimator,
 * ./groundingCostEstimator, ./groundingVerification
 * @security_gate Provider metadata only.
 * @owner_context 411 Scanner production economics.
 */

const {
  estimateGeminiTokenCost,
} = require("./tokenCostEstimator");

const {
  estimateGroundingCost,
} = require("./groundingCostEstimator");

const {
  buildGroundingVerification,
} = require("./groundingVerification");

function cloneProviderUsage(
  usageMetadata
) {
  return JSON.parse(
    JSON.stringify(
      usageMetadata || {}
    )
  );
}

function roundMoney(value) {
  return Number(
    Number(value || 0)
      .toFixed(8)
  );
}

function buildAttemptTelemetry(
  response,
  attemptNumber
) {
  const usageMetadata =
    response.usageMetadata || {};

  const groundingVerification =
    buildGroundingVerification(
      response
    );

  const tokenEconomics =
    estimateGeminiTokenCost(
      usageMetadata
    );

  const groundingEconomics =
    estimateGroundingCost(
      response
    );

  return {
    attemptNumber,

    providerUsageMetadata:
      cloneProviderUsage(
        usageMetadata
      ),

    groundingVerification,

    promptTokenCount:
      usageMetadata
        .promptTokenCount || 0,

    candidatesTokenCount:
      usageMetadata
        .candidatesTokenCount || 0,

    totalTokenCount:
      usageMetadata
        .totalTokenCount || 0,

    cachedContentTokenCount:
      usageMetadata
        .cachedContentTokenCount || 0,

    thoughtsTokenCount:
      usageMetadata
        .thoughtsTokenCount || 0,

    finishReason:
      response.candidates?.[0]
        ?.finishReason || null,

    tokenEconomics,

    groundingEconomics,

    estimatedResearchCostUsdAtPaidRate:
      roundMoney(
        tokenEconomics
          .estimatedTokenCostUsd +
        groundingEconomics
          .estimatedGroundingCostUsdAtPaidRate
      ),
  };
}

module.exports = {
  buildAttemptTelemetry,
};

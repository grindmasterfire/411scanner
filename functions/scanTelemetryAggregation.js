/**
 * @file functions/scanTelemetryAggregation.js
 * @class Class 2
 * @cap 250 Lines
 * @responsibility Aggregate all Gemini provider attempts
 * into one immutable request-level telemetry record.
 * @dependencies None.
 * @security_gate Arithmetic only; no network access.
 * @owner_context 411 Scanner production economics.
 */

function roundMoney(value) {
  return Number(
    Number(value || 0)
      .toFixed(8)
  );
}

function sumAttempts(
  attempts,
  field
) {
  return attempts.reduce(
    (total, attempt) =>
      total +
      Number(
        attempt?.[field] || 0
      ),
    0
  );
}

function aggregateTelemetry(
  attempts,
  historicalEvidencePacket,
  modelName
) {
  const finalAttempt =
    attempts[
      attempts.length - 1
    ];

  const tokenCost =
    attempts.reduce(
      (total, attempt) =>
        total +
        Number(
          attempt
            ?.tokenEconomics
            ?.estimatedTokenCostUsd ||
          0
        ),
      0
    );

  const groundingCost =
    attempts.reduce(
      (total, attempt) =>
        total +
        Number(
          attempt
            ?.groundingEconomics
            ?.estimatedGroundingCostUsdAtPaidRate ||
          0
        ),
      0
    );

  const googleSearchQueryCount =
    attempts.reduce(
      (total, attempt) =>
        total +
        Number(
          attempt
            ?.groundingEconomics
            ?.googleSearchQueryCount ||
          0
        ),
      0
    );

  return {
    operation:
      "initial_scan",

    model:
      modelName,

    attemptCount:
      attempts.length,

    attempts:
      attempts.map(
        (attempt) => ({
          attemptNumber:
            attempt.attemptNumber,

          groundingVerification:
            attempt
              .groundingVerification,

          promptTokenCount:
            attempt.promptTokenCount,

          candidatesTokenCount:
            attempt
              .candidatesTokenCount,

          totalTokenCount:
            attempt.totalTokenCount,

          cachedContentTokenCount:
            attempt
              .cachedContentTokenCount,

          thoughtsTokenCount:
            attempt.thoughtsTokenCount,

          finishReason:
            attempt.finishReason,

          tokenEconomics:
            attempt.tokenEconomics,

          groundingEconomics:
            attempt.groundingEconomics,

          estimatedResearchCostUsdAtPaidRate:
            attempt
              .estimatedResearchCostUsdAtPaidRate,
        })
      ),

    providerUsageMetadata:
      finalAttempt
        .providerUsageMetadata,

    providerUsageMetadataAttempts:
      attempts.map(
        (attempt) =>
          attempt
            .providerUsageMetadata
      ),

    groundingVerification:
      finalAttempt
        .groundingVerification,

    promptTokenCount:
      sumAttempts(
        attempts,
        "promptTokenCount"
      ),

    candidatesTokenCount:
      sumAttempts(
        attempts,
        "candidatesTokenCount"
      ),

    totalTokenCount:
      sumAttempts(
        attempts,
        "totalTokenCount"
      ),

    cachedContentTokenCount:
      sumAttempts(
        attempts,
        "cachedContentTokenCount"
      ),

    thoughtsTokenCount:
      sumAttempts(
        attempts,
        "thoughtsTokenCount"
      ),

    finishReason:
      finalAttempt.finishReason,

    historicalContextUsed:
      Boolean(
        historicalEvidencePacket
      ),

    historicalStateCount:
      historicalEvidencePacket
        ?.stateCount || 0,

    tokenEconomics: {
      ...finalAttempt
        .tokenEconomics,

      estimatedTokenCostUsd:
        roundMoney(
          tokenCost
        ),
    },

    groundingEconomics: {
      ...finalAttempt
        .groundingEconomics,

      googleSearchQueryCount,

      estimatedGroundingCostUsdAtPaidRate:
        roundMoney(
          groundingCost
        ),
    },

    estimatedResearchCostUsdAtPaidRate:
      roundMoney(
        tokenCost +
        groundingCost
      ),
  };
}

module.exports = {
  aggregateTelemetry,
};

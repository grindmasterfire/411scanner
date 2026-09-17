/**
 * @file functions/scanReceiptBuilder.js
 * @class Class 3
 * @cap 400 Lines
 * @responsibility Build one immutable, human-readable accounting receipt for a 411 scan request.
 * @dependencies None.
 * @security_gate Accounting only. Never affects evidence, scoring, cache reuse, identity, or user conclusions.
 * @owner_context 411 Scanner Business Center request economics.
 *
 * One request may now contain two Gemini attempts when mandatory grounding
 * requires the single allowed retry. Top-level telemetry contains aggregate
 * cost and usage so no provider expense disappears.
 */

const RECEIPT_SCHEMA_VERSION =
  "t07a-v2";

function number(value) {
  const parsed =
    Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

function originalCostFromTelemetry(
  telemetry
) {
  if (
    !telemetry ||
    typeof telemetry !== "object"
  ) {
    return null;
  }

  return number(
    telemetry
      .estimatedResearchCostUsdAtPaidRate
  );
}

function isAiResearchMode(mode) {
  return (
    mode === "fresh_analysis" ||
    mode === "stale_refresh" ||
    mode === "grounding_rejected"
  );
}

function describeCostDriver(
  tokenCostUsd,
  groundingCostUsd
) {
  if (
    tokenCostUsd <= 0 &&
    groundingCostUsd <= 0
  ) {
    return "No new AI research cost was incurred by this request.";
  }

  if (
    groundingCostUsd >
    tokenCostUsd
  ) {
    return "Most of this request's estimated research cost came from Google web research.";
  }

  if (
    tokenCostUsd >
    groundingCostUsd
  ) {
    return "Most of this request's estimated research cost came from Gemini token usage.";
  }

  return "Gemini token usage and Google web research contributed about equally to this request's estimated research cost.";
}

function describeMode(mode) {
  switch (mode) {
    case "exact":
      return "A current Cache Bank report matched this exact image, so no new AI research was required.";

    case "cross_creative":
      return "A current report from the same evidence-supported solicitation was reused for a different creative, so no new AI research was required.";

    case "stale_refresh":
      return "The previous report was stale, so 411 performed fresh grounded AI research before returning the result.";

    case "fresh_analysis":
      return "No reusable current report was available, so 411 performed fresh grounded AI research.";

    case "grounding_rejected":
      return "Gemini research ran, but the allowed attempts did not produce sufficient provider-confirmed live grounding, so 411 rejected the intelligence.";

    default:
      return "411 recorded this scan request, but its request mode was not recognized.";
  }
}

function buildScanReceipt({
  requestId,
  investigationId = null,
  sourceInvestigationId = null,
  cacheKey = null,
  sourceCacheKey = null,
  mode,
  report = {},
  telemetry = null,
  sourceTelemetry = null,
}) {
  const aiResearchPerformed =
    isAiResearchMode(mode);

  const acceptedIntelligence =
    mode !==
    "grounding_rejected";

  const currentTelemetry =
    aiResearchPerformed
      ? telemetry || {}
      : {};

  const attemptCount =
    aiResearchPerformed
      ? Math.max(
          1,
          number(
            currentTelemetry
              .attemptCount || 1
          )
        )
      : 0;

  const tokenEconomics =
    currentTelemetry
      .tokenEconomics || {};

  const groundingEconomics =
    currentTelemetry
      .groundingEconomics || {};

  const tokenCostUsd =
    number(
      tokenEconomics
        .estimatedTokenCostUsd
    );

  const groundingCostUsd =
    number(
      groundingEconomics
        .estimatedGroundingCostUsdAtPaidRate
    );

  const requestResearchCostUsd =
    aiResearchPerformed
      ? number(
          currentTelemetry
            .estimatedResearchCostUsdAtPaidRate
        )
      : 0;

  const originalResearchTelemetry =
    acceptedIntelligence
      ? aiResearchPerformed
        ? currentTelemetry
        : sourceTelemetry
      : null;

  const pricingTelemetry =
    aiResearchPerformed
      ? currentTelemetry
      : sourceTelemetry;

  const originalResearchCostUsd =
    originalCostFromTelemetry(
      originalResearchTelemetry
    );

  const card =
    report?.consumer_card || {};

  const usage = {
    aiAttempts:
      attemptCount,

    promptTokens:
      number(
        currentTelemetry
          .promptTokenCount
      ),

    outputTokens:
      number(
        currentTelemetry
          .candidatesTokenCount
      ),

    thoughtTokens:
      number(
        currentTelemetry
          .thoughtsTokenCount
      ),

    cachedContentTokens:
      number(
        currentTelemetry
          .cachedContentTokenCount
      ),

    totalTokens:
      number(
        currentTelemetry
          .totalTokenCount
      ),

    googleSearchQueries:
      number(
        groundingEconomics
          .googleSearchQueryCount
      ),
  };

  const cost = {
    newAiCalls:
      attemptCount,

    tokenCostUsd,

    groundingCostUsdAtPaidRate:
      groundingCostUsd,

    requestResearchCostUsdAtPaidRate:
      requestResearchCostUsd,

    originalResearchCostUsdAtPaidRate:
      originalResearchCostUsd,
  };

  const historical = {
    used:
      Boolean(
        currentTelemetry
          .historicalContextUsed
      ),

    stateCount:
      number(
        currentTelemetry
          .historicalStateCount
      ),

    continuityMode:
      currentTelemetry
        .historicalContinuityMode ||
      null,

    sourceCacheKey:
      currentTelemetry
        .historicalSourceCacheKey ||
      null,
  };

  const callWord =
    attemptCount === 1
      ? "attempt"
      : "attempts";

  const costSummary =
    mode ===
    "grounding_rejected"
      ? `The ${attemptCount} rejected provider ${callWord} incurred an estimated $${requestResearchCostUsd.toFixed(4)} in AI research cost.`
      : aiResearchPerformed
        ? `This request used ${attemptCount} Gemini ${callWord} and incurred an estimated $${requestResearchCostUsd.toFixed(4)} in new AI research cost.`
        : "This request reused intelligence 411 had already paid to research.";

  return {
    schemaVersion:
      RECEIPT_SCHEMA_VERSION,

    requestId:
      requestId || null,

    operation:
      "scan",

    mode:
      mode || "unknown",

    cacheHit:
      !aiResearchPerformed,

    aiResearchPerformed,

    acceptedIntelligence,

    investigationId:
      acceptedIntelligence
        ? investigationId || null
        : null,

    sourceInvestigationId:
      sourceInvestigationId ||
      null,

    cacheKey:
      cacheKey || null,

    sourceCacheKey:
      sourceCacheKey || null,

    targetName:
      card.target_name ||
      "Unknown Target",

    model:
      currentTelemetry.model ||
      sourceTelemetry?.model ||
      null,

    usage,
    cost,
    historical,

    pricing: {
      token:
        pricingTelemetry
          ?.tokenEconomics
          ?.pricing ||
        null,

      grounding:
        pricingTelemetry
          ?.groundingEconomics
          ?.pricing ||
        null,
    },

    plainEnglish: {
      whatHappened:
        describeMode(mode),

      costSummary,

      costDriver:
        describeCostDriver(
          tokenCostUsd,
          groundingCostUsd
        ),

      provenance:
        !aiResearchPerformed &&
        originalResearchCostUsd !==
          null
          ? `The original investigation cost about $${originalResearchCostUsd.toFixed(4)} at the recorded paid-rate estimate. That cost was not charged again here.`
          : null,
    },
  };
}

module.exports = {
  buildScanReceipt,
};

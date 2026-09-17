/**
 * @file functions/businessCenterReport.js
 * @class Class 3 (Business Reporting Component)
 * @cap 400 Lines
 * @responsibility Aggregate T07 scan receipts into read-friendly 411 Business Center reporting.
 * @dependencies None.
 * @security_gate Read-only accounting math. Never affects scan intelligence, scoring, identity, or cache reuse.
 * @owner_context 411 Scanner T07 Business Center reporting.
 *
 * Incurred cost means provider cost actually attributed to requests,
 * including attempts rejected by the mandatory-grounding gate.
 *
 * Successful fresh-scan statistics include only accepted fresh research.
 * Grounding-rejected attempts remain visible as their own business outcome.
 *
 * Cache savings use original investigation cost as a reference estimate,
 * not an exact counterfactual future invoice.
 */

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sum(values) {
  return values.reduce(
    (total, value) => total + number(value),
    0
  );
}

function percentile(values, fraction) {
  if (!values.length) {
    return 0;
  }

  const sorted =
    [...values].sort((a, b) => a - b);

  const index =
    (sorted.length - 1) * fraction;

  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) {
    return sorted[lower];
  }

  return sorted[lower] +
    (sorted[upper] - sorted[lower]) *
    (index - lower);
}

function summarizeCosts(values) {
  if (!values.length) {
    return {
      min: 0,
      average: 0,
      median: 0,
      p95: 0,
      max: 0,
    };
  }

  return {
    min: Math.min(...values),
    average: sum(values) / values.length,
    median: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    max: Math.max(...values),
  };
}

/** Build one aggregate report from already-selected request receipts. */
function buildBusinessSummary(receipts = []) {
  const modes = {
    fresh_analysis: 0,
    stale_refresh: 0,
    grounding_rejected: 0,
    exact: 0,
    cross_creative: 0,
    unknown: 0,
  };

  const freshCosts = [];
  let rejectedAttemptCostUsd = 0;
  let cacheReferenceSavingsUsd = 0;

  const usageTotals = {
    promptTokens: 0,
    outputTokens: 0,
    thoughtTokens: 0,
    cachedContentTokens: 0,
    totalTokens: 0,
    googleSearchQueries: 0,
  };

  const costTotals = {
    tokenCostUsd: 0,
    groundingCostUsdAtPaidRate: 0,
    incurredResearchCostUsdAtPaidRate: 0,
  };

  for (const receipt of receipts) {
    const mode =
      receipt?.mode || "unknown";

    if (
      Object.prototype.hasOwnProperty.call(
        modes,
        mode
      )
    ) {
      modes[mode]++;
    } else {
      modes.unknown++;
    }

    const usage =
      receipt?.usage || {};

    for (
      const key of Object.keys(
        usageTotals
      )
    ) {
      usageTotals[key] +=
        number(usage[key]);
    }

    const cost =
      receipt?.cost || {};

    costTotals.tokenCostUsd +=
      number(cost.tokenCostUsd);

    costTotals
      .groundingCostUsdAtPaidRate +=
        number(
          cost.groundingCostUsdAtPaidRate
        );

    const incurred =
      number(
        cost.requestResearchCostUsdAtPaidRate
      );

    costTotals
      .incurredResearchCostUsdAtPaidRate +=
        incurred;

    if (
      mode === "fresh_analysis" ||
      mode === "stale_refresh"
    ) {
      freshCosts.push(incurred);
    }

    if (
      mode === "grounding_rejected"
    ) {
      rejectedAttemptCostUsd +=
        incurred;
    }

    if (
      mode === "exact" ||
      mode === "cross_creative"
    ) {
      cacheReferenceSavingsUsd +=
        number(
          cost.originalResearchCostUsdAtPaidRate
        );
    }
  }

  const freshRequests =
    modes.fresh_analysis +
    modes.stale_refresh;

  const cacheHits =
    modes.exact +
    modes.cross_creative;

  const groundingRejectedRequests =
    modes.grounding_rejected;

  /*
   * Rejected provider attempts are real requests and real expenses, but
   * they produced no resolved intelligence. Cache efficiency therefore
   * compares only successful fresh resolutions against successful reuse.
   */
  const resolvedRequests =
    freshRequests + cacheHits;

  return {
    requestCount:
      receipts.length,

    resolvedRequests,

    modes,

    freshRequests,

    groundingRejectedRequests,

    cacheHits,

    cacheHitRate:
      resolvedRequests
        ? cacheHits / resolvedRequests
        : 0,

    usageTotals,

    costTotals: {
      ...costTotals,

      rejectedAttemptCostUsd,

      cacheReferenceSavingsUsd,

      savingsBasis:
        "sum_of_original_research_costs_referenced_by_cache_reuse",
    },

    freshResearchCostStats:
      summarizeCosts(
        freshCosts
      ),
  };
}

function money(value) {
  return `$${number(value).toFixed(4)}`;
}

function integer(value) {
  return Math.round(
    number(value)
  ).toLocaleString("en-US");
}

/** Format one aggregate report for a non-specialist operator. */
function formatBusinessSummary(
  summary,
  label = "Selected period"
) {
  const lines = [
    "",
    "========================================",
    "411 SCANNER BUSINESS CENTER",
    "========================================",
    `Period: ${label}`,
    `Requests: ${integer(summary.requestCount)}`,
    `Resolved scans: ${integer(summary.resolvedRequests)}`,
    `Fresh AI research: ${integer(summary.freshRequests)}`,
    `Grounding rejected: ${integer(summary.groundingRejectedRequests)}`,
    `Cache Bank reuses: ${integer(summary.cacheHits)}`,
    `Cache hit rate: ${(number(summary.cacheHitRate) * 100).toFixed(1)}%`,
    "",
    "REQUEST MODES",
    `  Fresh analysis: ${integer(summary.modes.fresh_analysis)}`,
    `  Stale refresh: ${integer(summary.modes.stale_refresh)}`,
    `  Grounding rejected: ${integer(summary.modes.grounding_rejected)}`,
    `  Exact cache: ${integer(summary.modes.exact)}`,
    `  Cross-creative cache: ${integer(summary.modes.cross_creative)}`,
    "",
    "AI USAGE",
    `  Prompt tokens: ${integer(summary.usageTotals.promptTokens)}`,
    `  Output tokens: ${integer(summary.usageTotals.outputTokens)}`,
    `  Thought tokens: ${integer(summary.usageTotals.thoughtTokens)}`,
    `  Cached-content tokens: ${integer(summary.usageTotals.cachedContentTokens)}`,
    `  Total tokens: ${integer(summary.usageTotals.totalTokens)}`,
    `  Google searches: ${integer(summary.usageTotals.googleSearchQueries)}`,
    "",
    "RESEARCH COST",
    `  Gemini tokens: ${money(summary.costTotals.tokenCostUsd)}`,
    `  Google grounding: ${money(summary.costTotals.groundingCostUsdAtPaidRate)}`,
    `  INCURRED AI RESEARCH: ${money(summary.costTotals.incurredResearchCostUsdAtPaidRate)}`,
    `  Rejected-attempt spend: ${money(summary.costTotals.rejectedAttemptCostUsd)}`,
    `  Cache reuse reference savings: ${money(summary.costTotals.cacheReferenceSavingsUsd)}`,
    "",
    "SUCCESSFUL FRESH-SCAN COST DISTRIBUTION",
    `  Cheapest: ${money(summary.freshResearchCostStats.min)}`,
    `  Average: ${money(summary.freshResearchCostStats.average)}`,
    `  Median: ${money(summary.freshResearchCostStats.median)}`,
    `  P95: ${money(summary.freshResearchCostStats.p95)}`,
    `  Most expensive: ${money(summary.freshResearchCostStats.max)}`,
    "",
    "Cache hit rate excludes grounding-rejected attempts because they",
    "produced no resolved intelligence.",
    "Savings note: cache savings use the original investigation cost",
    "as a reference and are not an exact counterfactual invoice.",
    "========================================",
  ];

  return lines.join("\n");
}

module.exports = {
  buildBusinessSummary,
  formatBusinessSummary,
};

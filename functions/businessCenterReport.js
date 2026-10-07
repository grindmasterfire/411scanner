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

const { messageFor } = require("./scanErrorCodes");

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

  // code5 -> { count, httpStatuses: { status: count } }
  const failureCodes = {};

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

    // Failure classification (locked 2026-10-07): count receipts carrying a
    // user-facing 5-digit code, keeping the raw HTTP status alongside for
    // internal correlation. Users never see the HTTP code.
    const code5 = receipt?.failureCode5 || null;
    if (code5) {
      failureCodes[code5] = failureCodes[code5] || { count: 0, httpStatuses: {} };
      failureCodes[code5].count += 1;
      const hs = receipt?.failureHttpStatus;
      if (hs != null) {
        const key = String(hs);
        failureCodes[code5].httpStatuses[key] =
          (failureCodes[code5].httpStatuses[key] || 0) + 1;
      }
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

  const rejectCauses =
    receipts.reduce((acc, r) => {
      if (r && r.mode === "grounding_rejected") {
        const cause = r.groundingCause || "unknown";
        acc[cause] = (acc[cause] || 0) + 1;
      }
      return acc;
    }, {});

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
    rejectCauses,

    // User-facing 5-digit failure taxonomy (locked 2026-10-07).
    failureCodes,

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
  // Failure section: one line per 5-digit code with its plain-language
  // explanation (the same sentence the user saw) plus the internal HTTP
  // statuses for correlation. Users never see HTTP codes.
  const failureCodes = summary.failureCodes || {};
  const failureLines = [];
  const sortedCodes = Object.keys(failureCodes).sort();
  if (sortedCodes.length === 0) {
    failureLines.push("  No coded failures recorded in this period.");
  }
  for (const code of sortedCodes) {
    const entry = failureCodes[code];
    const httpBits = Object.keys(entry.httpStatuses || {})
      .sort()
      .map((s) => `${s} x${entry.httpStatuses[s]}`)
      .join(", ");
    failureLines.push(`  [${code}] x${entry.count}: ${messageFor(code)}`);
    if (httpBits) failureLines.push(`           (internal HTTP: ${httpBits})`);
  }

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
    "In plain terms: how many scans came in, how many produced a finished",
    "report, and how many were served from reports we already had.",
    "",
    "REQUEST MODES",
    `  Fresh analysis: ${integer(summary.modes.fresh_analysis)}`,
    `  Stale refresh: ${integer(summary.modes.stale_refresh)}`,
    `  Grounding rejected: ${integer(summary.modes.grounding_rejected)}`,
    `  Exact cache: ${integer(summary.modes.exact)}`,
    `  Cross-creative cache: ${integer(summary.modes.cross_creative)}`,
    "In plain terms: how each request was handled — fresh AI investigation,",
    "a reused report, or a rejection when the AI could not verify its work.",
    "",
    "FAILURES BY CODE",
    ...failureLines,
    "In plain terms: what went wrong, in the same words the user saw.",
    "The 5-digit code is what users quote to support; HTTP codes are",
    "internal only and never shown to users.",
    "",
    "AI USAGE",
    `  Prompt tokens: ${integer(summary.usageTotals.promptTokens)}`,
    `  Output tokens: ${integer(summary.usageTotals.outputTokens)}`,
    `  Thought tokens: ${integer(summary.usageTotals.thoughtTokens)}`,
    `  Cached-content tokens: ${integer(summary.usageTotals.cachedContentTokens)}`,
    `  Total tokens: ${integer(summary.usageTotals.totalTokens)}`,
    `  Google searches: ${integer(summary.usageTotals.googleSearchQueries)}`,
    "In plain terms: how much AI work the scans consumed. Bigger numbers",
    "mean deeper investigations — and higher cost.",
    "",
    "RESEARCH COST",
    `  Gemini tokens: ${money(summary.costTotals.tokenCostUsd)}`,
    `  Google grounding: ${money(summary.costTotals.groundingCostUsdAtPaidRate)}`,
    `  INCURRED AI RESEARCH: ${money(summary.costTotals.incurredResearchCostUsdAtPaidRate)}`,
    `  Rejected-attempt spend: ${money(summary.costTotals.rejectedAttemptCostUsd)}`,
    `  Cache reuse reference savings: ${money(summary.costTotals.cacheReferenceSavingsUsd)}`,
    "In plain terms: what the AI research cost us this period. Cache reuses",
    "keep this down — every reuse is a scan we did not have to pay for twice.",
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

/*
 * Revenue ledger reporting (2026-10-07). Reads immutable revenue_events
 * written by the grant path. Gross revenue only — Play's cut, taxes, and
 * refunds live in Play Console, not here.
 */

/** Build one aggregate revenue report from already-selected events. */
function buildRevenueSummary(
  events = []
) {
  // productId -> { units, revenueUsd, kind, tier, period }
  const byProduct = {};
  // tier -> { units, revenueUsd }
  const byTier = {};
  const byKind = {
    subscription: { units: 0, revenueUsd: 0 },
    topup: { units: 0, revenueUsd: 0 },
  };
  // verification mode -> { events, revenueUsd }
  const byVerification = {};
  // rejectionReason -> { count, attemptedUsd }
  const rejections = {};

  let grantedEvents = 0;
  let grantedRevenueUsd = 0;
  let rejectedEvents = 0;

  for (const event of events) {
    const outcome = event?.outcome || "unknown";

    if (outcome !== "granted") {
      rejectedEvents += 1;
      const reason =
        event?.rejectionReason || "unknown";
      rejections[reason] =
        rejections[reason] || {
          count: 0,
          attemptedUsd: 0,
        };
      rejections[reason].count += 1;
      rejections[reason].attemptedUsd +=
        number(
          event?.attemptedPriceUsd
        );
      continue;
    }

    grantedEvents += 1;
    const revenue = number(event?.priceUsd);
    grantedRevenueUsd += revenue;

    const productId =
      event?.productId || "unknown";
    byProduct[productId] =
      byProduct[productId] || {
        units: 0,
        revenueUsd: 0,
        kind: event?.kind || null,
        tier: event?.tier || null,
        period: event?.period || null,
      };
    byProduct[productId].units += 1;
    byProduct[productId].revenueUsd +=
      revenue;

    const tier = event?.tier || "topup";
    byTier[tier] = byTier[tier] || {
      units: 0,
      revenueUsd: 0,
    };
    byTier[tier].units += 1;
    byTier[tier].revenueUsd += revenue;

    const kind = event?.kind;
    if (
      kind === "subscription" ||
      kind === "topup"
    ) {
      byKind[kind].units += 1;
      byKind[kind].revenueUsd += revenue;
    }

    const vMode =
      (event?.verification &&
        event.verification.mode) ||
      "unknown";
    byVerification[vMode] =
      byVerification[vMode] || {
        events: 0,
        revenueUsd: 0,
      };
    byVerification[vMode].events += 1;
    byVerification[vMode].revenueUsd +=
      revenue;
  }

  /*
   * MRR estimate: monthly at face, annual / 12, weekly x 4.33.
   * Top-ups are not recurring and are excluded. Labeled an estimate —
   * real MRR lives in Play Console with churn and proration.
   */
  let mrrEstimateUsd = 0;
  for (const productId of Object.keys(
    byProduct
  )) {
    const entry = byProduct[productId];
    if (entry.kind !== "subscription") {
      continue;
    }
    if (entry.period === "monthly") {
      mrrEstimateUsd += entry.revenueUsd;
    } else if (
      entry.period === "annual"
    ) {
      mrrEstimateUsd +=
        entry.revenueUsd / 12;
    } else if (
      entry.period === "weekly"
    ) {
      mrrEstimateUsd +=
        entry.revenueUsd * 4.33;
    }
  }

  return {
    eventCount: events.length,
    grantedEvents,
    rejectedEvents,
    grantedRevenueUsd,
    byProduct,
    byTier,
    byKind,
    byVerification,
    rejections,
    mrrEstimateUsd,
  };
}

/**
 * Format one revenue report for a non-specialist operator.
 * incurredResearchCostUsd comes from the cost summary for the same period;
 * together they form the profit line — the paycheck number.
 */
function formatRevenueSummary(
  summary,
  incurredResearchCostUsd = 0,
  label = "Selected period"
) {
  const productLines = [];
  const productIds = Object.keys(
    summary.byProduct
  ).sort();
  if (!productIds.length) {
    productLines.push(
      "  No granted revenue events in this period."
    );
  }
  for (const productId of productIds) {
    const entry =
      summary.byProduct[productId];
    productLines.push(
      `  ${productId}: ${entry.units} x ` +
        `${money(entry.revenueUsd / Math.max(1, entry.units))} = ` +
        `${money(entry.revenueUsd)}`
    );
  }

  const tierLines = [];
  const tiers = Object.keys(
    summary.byTier
  ).sort();
  for (const tier of tiers) {
    const entry = summary.byTier[tier];
    tierLines.push(
      `  ${tier}: ${entry.units} sale(s), ` +
        `${money(entry.revenueUsd)}`
    );
  }
  if (!tierLines.length) {
    tierLines.push("  (none)");
  }

  const verifyLines = [];
  const vModes = Object.keys(
    summary.byVerification
  ).sort();
  for (const vMode of vModes) {
    const entry =
      summary.byVerification[vMode];
    const share =
      summary.grantedRevenueUsd > 0
        ? (
            (entry.revenueUsd /
              summary.grantedRevenueUsd) *
            100
          ).toFixed(1)
        : "0.0";
    verifyLines.push(
      `  ${vMode}: ${entry.events} event(s), ` +
        `${money(entry.revenueUsd)} (${share}% of revenue)`
    );
  }
  if (!verifyLines.length) {
    verifyLines.push("  (none)");
  }

  const rejectionLines = [];
  const reasons = Object.keys(
    summary.rejections
  ).sort();
  if (!reasons.length) {
    rejectionLines.push(
      "  No rejected grant attempts in this period."
    );
  }
  for (const reason of reasons) {
    const entry =
      summary.rejections[reason];
    rejectionLines.push(
      `  ${reason}: x${entry.count} ` +
        `(attempted ${money(entry.attemptedUsd)})`
    );
  }

  const cost = number(
    incurredResearchCostUsd
  );
  const revenue = number(
    summary.grantedRevenueUsd
  );
  const profit = revenue - cost;

  const lines = [
    "",
    "========================================",
    "411 SCANNER REVENUE CENTER",
    "========================================",
    `Period: ${label}`,
    `Grant events: ${integer(summary.eventCount)} ` +
      `(${integer(summary.grantedEvents)} granted, ` +
      `${integer(summary.rejectedEvents)} rejected)`,
    `GROSS REVENUE: ${money(revenue)}`,
    `MRR estimate: ${money(summary.mrrEstimateUsd)}/mo`,
    "In plain terms: what the business earned this period, before Play's",
    "cut, taxes, and refunds (those live in Play Console).",
    "",
    "REVENUE BY PRODUCT",
    ...productLines,
    "",
    "REVENUE BY TIER",
    ...tierLines,
    "",
    "SUBSCRIPTIONS vs TOP-UPS",
    `  Subscriptions: ${summary.byKind.subscription.units} sale(s), ` +
      `${money(summary.byKind.subscription.revenueUsd)}`,
    `  Top-ups: ${summary.byKind.topup.units} sale(s), ` +
      `${money(summary.byKind.topup.revenueUsd)}`,
    "",
    "VERIFICATION MODE",
    ...verifyLines,
    "In plain terms: how much revenue was verified against Google Play",
    "vs trusted from the app. Trust-client revenue is fraud exposure —",
    "it should read 0% once real verification ships.",
    "",
    "REJECTED GRANT ATTEMPTS",
    ...rejectionLines,
    "In plain terms: purchase attempts that did not go through. A spike",
    "here means abuse, a broken client, or verification trouble.",
    "",
    "PROFIT LINE",
    `  Gross revenue:      ${money(revenue)}`,
    `  AI research cost:   ${money(cost)}`,
    `  GROSS MARGIN:       ${money(profit)}`,
    "In plain terms: revenue minus what the scans cost to run. This is",
    "the number that pays the bills. Cache reuses make this bigger —",
    "every reuse is revenue without a matching AI bill.",
    "",
    "MRR is an estimate: monthly at face value, annual / 12, weekly x 4.33.",
    "Top-ups are excluded (not recurring). Real MRR with churn lives in",
    "Play Console.",
    "========================================",
  ];

  return lines.join("\n");
}

module.exports = {
  buildBusinessSummary,
  formatBusinessSummary,
  buildRevenueSummary,
  formatRevenueSummary,
};

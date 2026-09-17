/**
 * @file functions/cacheFreshnessPolicy.js
 * @class Class 1
 * @cap 150 Lines
 * @responsibility Classify solicitation volatility and define Cache Bank freshness windows.
 * @dependencies None.
 * @security_gate Freshness policy never establishes identity, evidence, or Action Meter.
 * @owner_context 411 Scanner Cache Bank freshness policy.
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const FRESHNESS_CLASSES = Object.freeze({
  VOLATILE: "volatile",
  NORMAL: "normal",
  STABLE: "stable",
});

const FRESHNESS_WINDOWS_MS = Object.freeze({
  [FRESHNESS_CLASSES.VOLATILE]: 24 * HOUR_MS,
  [FRESHNESS_CLASSES.NORMAL]: 7 * DAY_MS,
  [FRESHNESS_CLASSES.STABLE]: 30 * DAY_MS,
});

const VOLATILE_TERMS = Object.freeze([
  "presale",
  "token sale",
  "airdrop",
  "crypto",
  "defi",
  "trading",
  "investment",
  "withdrawal",
  "limited time",
  "countdown",
  "sweepstakes",
]);

const STABLE_TERMS = Object.freeze([
  "calculator",
  "converter",
  "reference",
  "documentation",
  "offline utility",
  "local utility",
]);

function collectPolicyText(report) {
  const card = report?.consumer_card || {};
  const pattern = report?.solicitation_pattern || {};
  const monetization =
    report?.technical_ledger?.monetization || {};

  return [
    card.target_name,
    ...(Array.isArray(card.classification_badges)
      ? card.classification_badges
      : []),
    pattern.solicitation_type,
    pattern.offer_or_request,
    pattern.requested_action,
    ...(Array.isArray(pattern.mechanics)
      ? pattern.mechanics
      : []),
    monetization.revenue_model,
    monetization.pricing,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function inferFreshnessClass(report) {
  const text = collectPolicyText(report);

  if (VOLATILE_TERMS.some((term) => text.includes(term))) {
    return FRESHNESS_CLASSES.VOLATILE;
  }

  if (STABLE_TERMS.some((term) => text.includes(term))) {
    return FRESHNESS_CLASSES.STABLE;
  }

  return FRESHNESS_CLASSES.NORMAL;
}

function getFreshnessWindowMs(freshnessClass) {
  return (
    FRESHNESS_WINDOWS_MS[freshnessClass] ||
    FRESHNESS_WINDOWS_MS[FRESHNESS_CLASSES.NORMAL]
  );
}

module.exports = {
  FRESHNESS_CLASSES,
  FRESHNESS_WINDOWS_MS,
  inferFreshnessClass,
  getFreshnessWindowMs,
};

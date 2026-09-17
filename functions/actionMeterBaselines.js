/**
 * @file functions/actionMeterBaselines.js
 * @class Class 1
 * @cap 150 Lines
 * @responsibility Validate evidence-backed knowledge/consequence signals and resolve server-owned minimum Action Meter placement.
 * @dependencies None.
 * @security_gate Category baselines express expertise and consequence burden, not fraud, illegitimacy, or moral judgment.
 * @owner_context 411 Scanner Action Meter calibration authority.
 *
 * Canon:
 * - Material crypto participation: minimum 5.6.
 * - Automated consequential financial execution: minimum 6.0.
 * - Professional-grade financial complexity/consequence: minimum 7.0.
 *
 * These are minimum suitability/knowledge placements.
 * They do not constitute negative findings.
 */

function hasEvidence(bucket) {
  return (
    Array.isArray(bucket) &&
    bucket.some(
      (item) =>
        typeof item === "string" &&
        item.trim().length > 0
    )
  );
}

/**
 * Gemini may identify calibration signals, but the server accepts
 * one only when its matching evidence receipt is populated.
 */
function extractBaselineSignals(parsedData) {
  const context =
    parsedData
      ?.consumer_card
      ?.action_meter_context || {};

  const evidence =
    context.evidence || {};

  return {
    cryptoParticipation:
      context.crypto_participation === true &&
      hasEvidence(
        evidence.crypto_participation
      ),

    automatedFinancialExecution:
      context
        .automated_financial_execution === true &&
      hasEvidence(
        evidence
          .automated_financial_execution
      ),

    professionalFinancialComplexity:
      context
        .professional_financial_complexity === true &&
      hasEvidence(
        evidence
          .professional_financial_complexity
      ),
  };
}

/**
 * Resolve the strongest applicable knowledge/consequence floor.
 *
 * The highest validated baseline wins; baselines do not stack.
 */
function getActionMeterBaseline(
  parsedData
) {
  const signals =
    extractBaselineSignals(parsedData);

  let minimumScore = 0;
  let reason = null;

  if (signals.cryptoParticipation) {
    minimumScore = 5.6;
    reason = "crypto_participation";
  }

  if (
    signals.automatedFinancialExecution
  ) {
    minimumScore = 6.0;
    reason =
      "automated_financial_execution";
  }

  if (
    signals.professionalFinancialComplexity
  ) {
    minimumScore = 7.0;
    reason =
      "professional_financial_complexity";
  }

  return {
    minimumScore,
    reason,
    signals,
  };
}

/**
 * Apply only the minimum placement.
 * This function never lowers an existing diagnostic score.
 */
function applyActionMeterBaseline(
  score,
  parsedData
) {
  const baseline =
    getActionMeterBaseline(parsedData);

  return {
    score:
      Math.max(
        Number(score) || 0,
        baseline.minimumScore
      ),

    baseline,
  };
}

module.exports = {
  extractBaselineSignals,
  getActionMeterBaseline,
  applyActionMeterBaseline,
};

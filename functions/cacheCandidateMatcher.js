/**
 * @file functions/cacheCandidateMatcher.js
 * @class Class 2
 * @cap 250 Lines
 * @responsibility Measure cross-creative identity signals and decide whether a current Cache Bank report is safe to reuse.
 * @dependencies ./cacheFreshness, ./cacheTextSignals, ./groundingVerification
 * @security_gate Completed-report reuse requires confirmed identity, temporal freshness, provider-proven grounding, and strong match evidence.
 * @owner_context 411 Scanner cross-creative Cache Bank reuse gate.
 *
 * @architecture_note
 * T03 needs freshness + identity strength before reusing a completed
 * report. Mandatory grounding adds a separate reuse privilege: current
 * intelligence is reusable only when its stored telemetry proves that the
 * source investigation actually used provider-reported Google Search.
 *
 * T04 may inspect the same identity-strength measurements when locating
 * historical research, but those measurements alone never authorize
 * returning an old report.
 *
 * Freshness, identity, and grounding remain deliberately separate concepts.
 * Passing one gate never implies that another gate has been satisfied.
 */

const {
  isCacheEntryFresh,
} = require("./cacheFreshness");

const {
  isTelemetryGrounded,
} = require("./groundingVerification");

const {
  tokenizeText,
  calculateTokenOverlap,
  countAnchorHits,
  containsAnchor,
} = require("./cacheTextSignals");

/**
 * Measure identity-related cross-creative signals without making a
 * freshness, grounding, or report-reuse decision.
 */
function measureCacheCandidateSignals(
  ocrText,
  candidate
) {
  if (!candidate) {
    return {
      identityConfirmed: false,
      overlap: 0,
      anchorHits: 0,
      strongAnchor: false,
    };
  }

  return {
    identityConfirmed:
      candidate.identityConfidence ===
      "confirmed",

    overlap:
      calculateTokenOverlap(
        tokenizeText(ocrText),
        candidate.ocrTokens
      ),

    anchorHits:
      countAnchorHits(
        ocrText,
        candidate.identityAnchors
      ),

    strongAnchor:
      containsAnchor(
        ocrText,
        candidate.primaryIdentityAnchor
      ),
  };
}

/**
 * Shared identity-strength threshold.
 *
 * This threshold may support either T03 current-report reuse or T04
 * historical continuity, but the caller still owns the privilege gate.
 */
function hasStrongCandidateMatch(
  signals
) {
  return Boolean(
    signals &&
    (
      (
        signals.strongAnchor &&
        signals.overlap >= 0.45
      ) ||
      (
        signals.anchorHits >= 2 &&
        signals.overlap >= 0.75
      )
    )
  );
}

/**
 * T03 completed-report reuse gate.
 *
 * A candidate must independently satisfy:
 * - confirmed solicitation identity,
 * - current temporal freshness,
 * - stored provider-proven grounding,
 * - strong cross-creative match signals.
 *
 * Legacy or zero-search intelligence fails grounding even if its TTL and
 * identity evidence are otherwise strong. It may still support historical
 * research through T04, but it cannot be returned as current intelligence.
 */
function assessCacheCandidate(
  ocrText,
  candidate,
  nowMs = Date.now()
) {
  if (!candidate) {
    return rejected(
      "missing_candidate"
    );
  }

  const signals =
    measureCacheCandidateSignals(
      ocrText,
      candidate
    );

  if (!signals.identityConfirmed) {
    return {
      reusable: false,
      reason:
        "identity_not_confirmed",
      ...signals,
    };
  }

  if (
    !isCacheEntryFresh(
      candidate,
      nowMs
    )
  ) {
    return {
      reusable: false,
      reason:
        "candidate_stale",
      ...signals,
    };
  }

  if (
    !isTelemetryGrounded(
      candidate.telemetry
    )
  ) {
    return {
      reusable: false,
      reason:
        "candidate_not_grounded",
      ...signals,
    };
  }

  const reusable =
    hasStrongCandidateMatch(
      signals
    );

  return {
    reusable,
    reason: reusable
      ? "confirmed_cross_creative_match"
      : "insufficient_match_strength",
    ...signals,
  };
}

function rejected(reason) {
  return {
    reusable: false,
    reason,
    identityConfirmed: false,
    overlap: 0,
    anchorHits: 0,
    strongAnchor: false,
  };
}

module.exports = {
  assessCacheCandidate,
  hasStrongCandidateMatch,
  measureCacheCandidateSignals,
};

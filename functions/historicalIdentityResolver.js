/**
 * @file functions/historicalIdentityResolver.js
 * @class Class 2
 * @cap 250 Lines
 * @responsibility Resolve a previously confirmed solicitation identity that may supply historical research context.
 * @dependencies ./cacheEntryStore, ./cacheTextSignals, ./cacheCandidateMatcher
 * @security_gate Never creates identity. It may only follow a previously confirmed identity key supported by exact-image continuity or strong existing cross-creative signals.
 * @owner_context 411 Scanner T04 historical evidence continuity.
 *
 * @architecture_note
 * Historical identity resolution has lower privilege than Cache Bank
 * report reuse.
 *
 * T03 requires freshness before returning a completed report.
 * T04 deliberately ignores freshness only when deciding which already
 * confirmed historical case file may guide a new current investigation.
 *
 * Exact-image continuity and cross-creative continuity are two paths
 * through the same responsibility, so this remains one cohesive
 * resolver rather than being split into artificial micro-modules.
 */

const {
  findCacheCandidates,
} = require("./cacheEntryStore");

const {
  tokenizeText,
} = require("./cacheTextSignals");

const {
  hasStrongCandidateMatch,
  measureCacheCandidateSignals,
} = require("./cacheCandidateMatcher");

function hasConfirmedIdentity(entry) {
  return Boolean(
    entry &&
    entry.identityConfidence === "confirmed" &&
    entry.solicitationIdentityKey
  );
}

/**
 * Exact-image continuity may locate the previously confirmed identity
 * even after its completed report has become stale.
 *
 * The returned identity key authorizes historical evidence lookup only.
 * It never authorizes returning the stale report.
 */
function resolveExactHistoricalIdentity(
  exactEntry
) {
  if (!hasConfirmedIdentity(exactEntry)) {
    return null;
  }

  return {
    identityKey:
      exactEntry.solicitationIdentityKey,

    mode:
      "exact_history",

    sourceCacheKey:
      exactEntry.cacheKey || null,
  };
}

/**
 * Different creatives may locate the same historical case file when
 * prior grounded identity is confirmed and the existing T03
 * cross-creative signal threshold is satisfied.
 *
 * Freshness is intentionally absent here because this function does
 * not return the historical report. It only identifies research leads
 * that current Gemini research must independently verify.
 */
async function resolveCrossCreativeHistoricalIdentity(
  db,
  ocrText,
  currentCacheKey
) {
  const tokens =
    tokenizeText(ocrText);

  if (!tokens.length) {
    return null;
  }

  const candidates =
    await findCacheCandidates(
      db,
      tokens
    );

  const matches =
    candidates
      .filter((candidate) =>
        candidate?.cacheKey &&
        candidate.cacheKey !== currentCacheKey &&
        hasConfirmedIdentity(candidate)
      )
      .map((candidate) => ({
        candidate,

        signals:
          measureCacheCandidateSignals(
            ocrText,
            candidate
          ),
      }))
      .filter(({ signals }) =>
        signals.identityConfirmed &&
        hasStrongCandidateMatch(
          signals
        )
      )
      .sort((left, right) => {
        const overlapDifference =
          right.signals.overlap -
          left.signals.overlap;

        if (overlapDifference !== 0) {
          return overlapDifference;
        }

        return (
          right.signals.anchorHits -
          left.signals.anchorHits
        );
      });

  const best =
    matches[0];

  if (!best) {
    return null;
  }

  return {
    identityKey:
      best.candidate
        .solicitationIdentityKey,

    mode:
      "cross_creative_history",

    sourceCacheKey:
      best.candidate.cacheKey,

    match: {
      overlap:
        best.signals.overlap,

      anchorHits:
        best.signals.anchorHits,

      strongAnchor:
        best.signals.strongAnchor,
    },
  };
}

/**
 * Prefer exact-image continuity when available. Only search other
 * creatives when the exact record does not already carry confirmed
 * historical identity.
 */
async function resolveHistoricalIdentity(
  db,
  exactEntry,
  ocrText,
  currentCacheKey
) {
  return (
    resolveExactHistoricalIdentity(
      exactEntry
    ) ||
    await resolveCrossCreativeHistoricalIdentity(
      db,
      ocrText,
      currentCacheKey
    )
  );
}

module.exports = {
  resolveHistoricalIdentity,
};

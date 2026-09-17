/**
 * @file functions/cacheReuseResolver.js
 * @class Class 1
 * @cap 150 Lines
 * @responsibility Resolve safe cross-creative Cache Bank reuse candidates and build alias metadata.
 * @dependencies ./cacheEntryStore, ./cacheTextSignals, ./cacheCandidateMatcher
 * @security_gate Candidate retrieval never establishes identity; reuse requires the existing fail-closed matcher.
 * @owner_context 411 Scanner Cache Bank reuse orchestration extracted from the production router.
 */

const {
  findCacheCandidates,
} = require("./cacheEntryStore");

const {
  tokenizeText,
} = require("./cacheTextSignals");

const {
  assessCacheCandidate,
} = require("./cacheCandidateMatcher");

/**
 * Builds metadata for a new exact-image alias created from a safe
 * cross-creative Cache Bank hit.
 *
 * The source verification clock is preserved deliberately. Reusing
 * intelligence for a new creative must never make old research appear
 * newly verified merely because another image matched it.
 */
function buildAliasMetadata(
  sourceEntry,
  ocrText
) {
  return {
    freshnessClass:
      sourceEntry.freshnessClass || null,
    lastVerifiedAt:
      sourceEntry.lastVerifiedAt || null,
    freshUntil:
      sourceEntry.freshUntil || null,
    solicitationIdentityKey:
      sourceEntry.solicitationIdentityKey || null,
    identityConfidence:
      sourceEntry.identityConfidence || "unknown",
    identityAnchors:
      Array.isArray(sourceEntry.identityAnchors)
        ? sourceEntry.identityAnchors
        : [],
    primaryIdentityAnchor:
      sourceEntry.primaryIdentityAnchor || "",
    stateFingerprint:
      sourceEntry.stateFingerprint || null,

    // Raw OCR is not stored. Only normalized tokens needed for
    // future cheap candidate discovery are retained.
    ocrTokens:
      tokenizeText(ocrText).slice(0, 80),

    // Provenance points back to the intelligence record that
    // actually avoided a new Gemini call.
    sourceCacheKey:
      sourceEntry.cacheKey || null,
  };
}

/**
 * Finds the strongest candidate that already satisfies the T03
 * cross-creative reuse security gate.
 *
 * Shared OCR tokens merely locate possible records. They never prove
 * actor identity or independently authorize reuse.
 */
async function findReusableCacheCandidate(
  db,
  ocrText,
  currentCacheKey
) {
  const ocrTokens =
    tokenizeText(ocrText);

  if (!ocrTokens.length) {
    return null;
  }

  const candidates =
    await findCacheCandidates(
      db,
      ocrTokens
    );

  const accepted = candidates
    .filter((candidate) =>
      candidate?.cacheKey &&
      candidate.cacheKey !== currentCacheKey
    )
    .map((candidate) => ({
      candidate,
      assessment:
        assessCacheCandidate(
          ocrText,
          candidate
        ),
    }))
    .filter(({ assessment }) =>
      assessment.reusable
    )
    .sort((left, right) => {
      // Prefer stronger text agreement. Anchor count only breaks
      // ties after both candidates have already passed the gate.
      const overlapDifference =
        right.assessment.overlap -
        left.assessment.overlap;

      if (overlapDifference !== 0) {
        return overlapDifference;
      }

      return (
        right.assessment.anchorHits -
        left.assessment.anchorHits
      );
    });

  return accepted[0] || null;
}

module.exports = {
  buildAliasMetadata,
  findReusableCacheCandidate,
};

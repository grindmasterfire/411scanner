/**
 * @file functions/groundingVerification.js
 * @class Class 2
 * @cap 250 Lines
 * @responsibility Prove live Google Search grounding, expose provider-grounded sources, and govern Cache Bank grounding eligibility.
 * @dependencies None.
 * @security_gate Model prose, generated URLs, and claimed citations never count as grounding proof.
 * @owner_context 411 Scanner mandatory-grounding authority.
 *
 * Fresh intelligence requires BOTH:
 * - at least one provider-reported Google Search query
 * - at least one provider-grounded web source
 *
 * Legacy cache entries without both forms of proof refresh rather than
 * silently inheriting trust under the stronger grounding standard.
 */

function getGroundingMetadata(response) {
  return (
    response
      ?.candidates?.[0]
      ?.groundingMetadata || {}
  );
}

function getProviderSearchQueryCount(response) {
  const queries =
    getGroundingMetadata(response)
      .webSearchQueries;

  if (!Array.isArray(queries)) {
    return 0;
  }

  return queries.filter(
    (query) =>
      typeof query === "string" &&
      query.trim().length > 0
  ).length;
}

/**
 * Preserve destinations only.
 * Search-query text never leaves this module.
 */
function getProviderGroundedSources(response) {
  const chunks =
    getGroundingMetadata(response)
      .groundingChunks;

  if (!Array.isArray(chunks)) {
    return [];
  }

  const sourceByUri =
    new Map();

  const sources = [];

  for (
    let chunkIndex = 0;
    chunkIndex < chunks.length;
    chunkIndex += 1
  ) {
    const chunk =
      chunks[chunkIndex];

    const uri =
      typeof chunk?.web?.uri === "string"
        ? chunk.web.uri.trim()
        : "";

    if (!uri) {
      continue;
    }

    const existing =
      sourceByUri.get(uri);

    if (existing) {
      existing.chunkIndices.push(
        chunkIndex
      );

      continue;
    }

    const source = {
      uri,

      title:
        typeof chunk?.web?.title === "string"
          ? chunk.web.title.trim()
          : "",

      chunkIndices: [
        chunkIndex,
      ],
    };

    sourceByUri.set(
      uri,
      source
    );

    sources.push(source);
  }

  return sources;
}

/**
 * Provider grounding supports bind generated response
 * segments to groundingChunks by index.
 *
 * Search-query text is intentionally not persisted here.
 */
function getProviderGroundingSupports(
  response
) {
  const supports =
    getGroundingMetadata(response)
      .groundingSupports;

  if (!Array.isArray(supports)) {
    return [];
  }

  return supports
    .map((support) => {
      const text =
        typeof support?.segment?.text ===
          "string"
          ? support.segment.text.trim()
          : "";

      const groundingChunkIndices =
        Array.isArray(
          support
            ?.groundingChunkIndices
        )
          ? support
              .groundingChunkIndices
              .filter(
                (value) =>
                  Number.isInteger(value) &&
                  value >= 0
              )
          : [];

      return {
        text,
        groundingChunkIndices,
      };
    })
    .filter(
      (support) =>
        support.text &&
        support
          .groundingChunkIndices
          .length > 0
    );
}

function buildGroundingVerification(response) {
  const googleSearchQueryCount =
    getProviderSearchQueryCount(response);

  const sources =
    getProviderGroundedSources(response);

  const supports =
    getProviderGroundingSupports(
      response
    );

  return {
    required: true,

    verified:
      googleSearchQueryCount > 0 &&
      sources.length > 0,

    googleSearchQueryCount,

    groundedSourceCount:
      sources.length,

    groundingSupportCount:
      supports.length,

    evidenceBasis:
      "provider_grounding_metadata",

    sources,

    supports,
  };
}

/**
 * Cache reuse requires the stronger current proof.
 *
 * Older telemetry containing only a query count is intentionally not
 * grandfathered. It becomes refresh-required instead.
 */
function isTelemetryGrounded(telemetry) {
  const verification =
    telemetry?.groundingVerification;

  return (
    verification?.verified === true &&
    Number(
      verification.googleSearchQueryCount || 0
    ) > 0 &&
    Number(
      verification.groundedSourceCount || 0
    ) > 0
  );
}

module.exports = {
  getProviderSearchQueryCount,
  getProviderGroundedSources,
  getProviderGroundingSupports,
  buildGroundingVerification,
  isTelemetryGrounded,
};

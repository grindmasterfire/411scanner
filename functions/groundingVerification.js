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

  const seen = new Set();
  const sources = [];

  for (const chunk of chunks) {
    const uri =
      typeof chunk?.web?.uri === "string"
        ? chunk.web.uri.trim()
        : "";

    if (!uri || seen.has(uri)) {
      continue;
    }

    seen.add(uri);

    sources.push({
      uri,
      title:
        typeof chunk?.web?.title === "string"
          ? chunk.web.title.trim()
          : "",
    });
  }

  return sources;
}

function buildGroundingVerification(response) {
  const googleSearchQueryCount =
    getProviderSearchQueryCount(response);

  const sources =
    getProviderGroundedSources(response);

  return {
    required: true,

    verified:
      googleSearchQueryCount > 0 &&
      sources.length > 0,

    googleSearchQueryCount,

    groundedSourceCount:
      sources.length,

    evidenceBasis:
      "provider_grounding_metadata",

    sources,
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
  buildGroundingVerification,
  isTelemetryGrounded,
};

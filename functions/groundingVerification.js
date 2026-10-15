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
 * Combine the grounding of several provider responses (the search-first
 * pass and the full research pass) into one verification. Chunk indices
 * are per-response, so each response's indices are offset past the ones
 * before it; a source seen twice keeps one entry with both index sets.
 */
function mergeGroundingVerifications(verifications) {
  const sources = [];
  const byUri = new Map();
  const supports = [];
  let offset = 0;
  let googleSearchQueryCount = 0;

  for (const v of verifications) {
    if (!v) continue;
    googleSearchQueryCount += Number(v.googleSearchQueryCount) || 0;
    let span = 0;
    for (const source of v.sources || []) {
      const indices = (source.chunkIndices || []).map((i) => i + offset);
      for (const i of source.chunkIndices || []) span = Math.max(span, i + 1);
      const existing = byUri.get(source.uri);
      if (existing) {
        existing.chunkIndices.push(...indices);
        continue;
      }
      const merged = { ...source, chunkIndices: indices };
      byUri.set(source.uri, merged);
      sources.push(merged);
    }
    for (const support of v.supports || []) {
      supports.push({
        ...support,
        groundingChunkIndices: (support.groundingChunkIndices || []).map((i) => i + offset),
      });
    }
    offset += span;
  }

  return {
    required: true,
    verified: googleSearchQueryCount > 0 && sources.length > 0,
    googleSearchQueryCount,
    groundedSourceCount: sources.length,
    groundingSupportCount: supports.length,
    evidenceBasis: "provider_grounding_metadata",
    sources,
    supports,
  };
}

/*
 * Report standard. Cached reports are resold only if made under the
 * current rules. 2 = 2026-10-15: search-first research, specific
 * searched_* reasons (no "unresolved"/"not researched"), no download
 * links. 3 = registry (RDAP) registrar/registrant and hosting receipts,
 * business-address research beyond WHOIS. 4 = platform hosts (LinkedIn,
 * social, app stores, file hosts) never probed; probe receipts carry only
 * probe-measured values. 5 = email screenshots: the sender is the target
 * (never the mail app), channel cataloged, sender read from OCR. 6 = a
 * probe unrelated to the report's own domains is discarded. Bump when a change makes older reports wrong to resell; each
 * older entry is then re-researched once on its next scan.
 */
const REPORT_STANDARD = 9;

function meetsReportStandard(telemetry) {
  return Number(telemetry?.reportStandard || 0) >= REPORT_STANDARD;
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
  mergeGroundingVerifications,
  isTelemetryGrounded,
  meetsReportStandard,
  REPORT_STANDARD,
};

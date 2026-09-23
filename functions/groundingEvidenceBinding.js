/**
 * @file functions/groundingEvidenceBinding.js
 * @class Class 1
 * @cap 150 Lines
 * @responsibility Bind Technical 411 evidence receipts to
 * provider-attributed grounding chunks.
 * @dependencies ./groundingSupportMatcher
 * @security_gate Never creates a source URL. Only provider
 * grounding chunk URIs may replace receipt source_url.
 * @owner_context 411 Scanner Technical 411.
 */

const {
  supportMatchesFinding,
} = require("./groundingSupportMatcher");

function clean(value) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function sourceForChunkIndex(
  groundedSources,
  chunkIndex
) {
  return groundedSources
    .find((source) =>
      Array.isArray(
        source?.chunkIndices
      ) &&
      source
        .chunkIndices
        .includes(chunkIndex)
    ) || null;
}

function findSupportedSource(
  receipt,
  groundedSources,
  groundedSupports
) {
  const finding =
    clean(receipt?.finding);

  if (!finding) {
    return null;
  }

  for (
    const support
    of groundedSupports
  ) {
    if (
      !supportMatchesFinding(
        finding,
        support?.text
      )
    ) {
      continue;
    }

    for (
      const chunkIndex
      of (
        support
          ?.groundingChunkIndices ||
        []
      )
    ) {
      const source =
        sourceForChunkIndex(
          groundedSources,
          chunkIndex
        );

      if (source?.uri) {
        return source;
      }
    }
  }

  return null;
}

function bindTechnicalEvidenceSources(
  report,
  groundedSources = [],
  groundedSupports = []
) {
  const receipts =
    report
      ?.technical_ledger
      ?.evidence_receipts;

  if (!Array.isArray(receipts)) {
    return report;
  }

  for (const receipt of receipts) {
    const source =
      findSupportedSource(
        receipt,
        groundedSources,
        groundedSupports
      );

    if (!source) {
      continue;
    }

    /*
     * Provider attribution wins.
     * No model-authored URL is promoted here.
     */
    receipt.source_url =
      source.uri;
  }

  return report;
}

module.exports = {
  bindTechnicalEvidenceSources,
};

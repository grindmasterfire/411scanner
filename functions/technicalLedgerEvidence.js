/**
 * @file functions/technicalLedgerEvidence.js
 * @class Class 2
 * @cap 250 Lines
 * @responsibility Normalize Technical 411 evidence receipts against provider-grounded web sources and prevent unsupported verified claims.
 * @dependencies None.
 * @security_gate A model claim cannot become verified merely because Gemini wrote a URL or confident sentence.
 * @owner_context 411 Scanner Technical 411 evidence authority.
 *
 * Canonical receipt states:
 * - verified: inspectable provider-grounded evidence establishes the claim.
 * - not_found: the relevant authority/source was researched and no record was found.
 * - not_applicable: the field does not apply to this target.
 * - unresolved: research occurred but evidence could not establish the claim.
 * - not_researched: the current grounded investigation did not establish the field.
 *
 * Regulatory claims receive the strictest treatment. "SEC certified" is
 * never accepted terminology. SEC registration requires an identified
 * subject, usable record identifier, and provider-grounded authority source.
 */

const VALID_STATUSES =
  new Set([
    "verified",
    "not_found",
    "not_applicable",
    "unresolved",
    "not_researched",
  ]);

function clean(value) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function normalizeUrl(value) {
  const url = clean(value);

  if (!url) {
    return "";
  }

  try {
    return new URL(url).toString();
  } catch (error) {
    return "";
  }
}

function buildGroundedSourceMap(
  groundedSources = []
) {
  const map = new Map();

  for (const source of groundedSources) {
    const uri =
      normalizeUrl(source?.uri);

    if (!uri) {
      continue;
    }

    map.set(uri, {
      uri,
      title:
        clean(source?.title),
    });
  }

  return map;
}

function isSecAuthority(receipt) {
  const authority =
    clean(receipt?.authority)
      .toLowerCase();

  const sourceUrl =
    normalizeUrl(
      receipt?.source_url
    ).toLowerCase();

  return (
    authority.includes(
      "securities and exchange commission"
    ) ||
    authority === "sec" ||
    sourceUrl.includes("sec.gov") ||
    sourceUrl.includes(
      "adviserinfo.sec.gov"
    )
  );
}

function isSecRegistrationClaim(receipt) {
  const field =
    clean(receipt?.field)
      .toLowerCase();

  const finding =
    clean(receipt?.finding)
      .toLowerCase();

  return (
    field.includes("sec") ||
    finding.includes("sec registered") ||
    finding.includes(
      "sec-registered"
    ) ||
    finding.includes(
      "registered investment adviser"
    )
  );
}

/**
 * One receipt is allowed to remain verified only when its source URL
 * exists in provider grounding metadata.
 *
 * SEC registration additionally requires an exact subject and record
 * identifier so 411 can distinguish a real filing from name similarity.
 */
function normalizeEvidenceReceipt(
  receipt,
  groundedSourceMap
) {
  const requestedStatus =
    VALID_STATUSES.has(
      clean(receipt?.status)
    )
      ? clean(receipt.status)
      : "unresolved";

  const sourceUrl =
    normalizeUrl(
      receipt?.source_url
    );

  const groundedSource =
    groundedSourceMap.get(
      sourceUrl
    ) || null;

  const normalized = {
    field:
      clean(receipt?.field),

    status:
      requestedStatus,

    finding:
      clean(receipt?.finding),

    authority:
      clean(receipt?.authority),

    subject:
      clean(receipt?.subject),

    identifier:
      clean(receipt?.identifier),

    source_url:
      groundedSource?.uri || "",

    source_title:
      groundedSource?.title || "",
  };

  if (
    normalized.status === "verified" &&
    !groundedSource
  ) {
    normalized.status =
      "unresolved";
  }

  if (
    normalized.status === "verified" &&
    isSecRegistrationClaim(normalized) &&
    (
      !isSecAuthority(normalized) ||
      !normalized.subject ||
      !normalized.identifier
    )
  ) {
    normalized.status =
      "unresolved";
  }

  if (
    normalized.finding
      .toLowerCase()
      .includes("sec certified")
  ) {
    normalized.status =
      "unresolved";

    normalized.finding =
      normalized.finding.replace(
        /sec certified/gi,
        "SEC registration not established"
      );
  }

  return normalized;
}

/**
 * Normalize all model-proposed Technical 411 evidence receipts.
 *
 * Provider-grounded sources are the authority boundary. Search terms and
 * raw grounding metadata are never copied into the report.
 */
function normalizeTechnicalEvidence(
  report,
  groundedSources = []
) {
  const ledger =
    report?.technical_ledger;

  if (!ledger) {
    return report;
  }

  const sourceMap =
    buildGroundedSourceMap(
      groundedSources
    );

  const proposedReceipts =
    Array.isArray(
      ledger.evidence_receipts
    )
      ? ledger.evidence_receipts
      : [];

  ledger.evidence_receipts =
    proposedReceipts.map(
      (receipt) =>
        normalizeEvidenceReceipt(
          receipt,
          sourceMap
        )
    );

  ledger.network_telemetry =
    ledger.network_telemetry || {};

  /*
   * Legacy Android currently expects grounding_sources as strings.
   * The server replaces model output with provider-proven destinations.
   */
  ledger.network_telemetry
    .grounding_sources =
      groundedSources
        .map(
          (source) =>
            normalizeUrl(source?.uri)
        )
        .filter(Boolean);

  return report;
}

module.exports = {
  normalizeEvidenceReceipt,
  normalizeTechnicalEvidence,
};

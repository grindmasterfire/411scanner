/**
 * @file functions/historicalEvidenceCompactor.js
 * @class Class 2
 * @cap 250 Lines
 * @responsibility Convert archived solicitation-state reports into bounded historical research context.
 * @dependencies None.
 * @security_gate Historical material is research context only; prior scores, verdicts, alternatives, and conclusions are excluded.
 * @owner_context 411 Scanner T04 historical evidence reuse.
 *
 * @architecture_note
 * This module performs pure transformation only.
 *
 * It does not read Firestore, establish solicitation identity, authorize
 * Cache Bank reuse, or decide whether historical context should be used.
 * Its sole job is to turn previously grounded state records into a small
 * research packet that cannot masquerade as a current diagnosis.
 */

const MAX_SOURCES_PER_STATE = 12;
const MAX_EVIDENCE_PER_BUCKET = 3;
const MAX_TEXT_LENGTH = 500;

function cleanText(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, MAX_TEXT_LENGTH);
}

function cleanList(
  value,
  limit
) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(
    value
      .map(cleanText)
      .filter(Boolean)
  )].slice(0, limit);
}

function timestampToText(value) {
  if (!value) {
    return "";
  }

  try {
    if (
      typeof value.toDate === "function"
    ) {
      return value
        .toDate()
        .toISOString();
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (typeof value === "string") {
      return value;
    }
  } catch (error) {
    return "";
  }

  return "";
}

/**
 * Preserve prior evidence receipts without preserving their old
 * boolean Floor-Raiser decisions.
 *
 * A receipt may tell current research what deserves re-checking.
 * It must never reactivate an old Floor Raiser by itself.
 */
function compactEvidenceReceipts(report) {
  const buckets =
    report?.consumer_card
      ?.floor_raiser_evidence || {};

  const result = {};

  Object.entries(buckets)
    .forEach(([key, values]) => {
      const cleaned =
        cleanList(
          values,
          MAX_EVIDENCE_PER_BUCKET
        );

      if (cleaned.length) {
        result[key] =
          cleaned;
      }
    });

  return result;
}

/**
 * Extract historical research ingredients from one archived state.
 *
 * Deliberately excluded:
 * - six-vector scores
 * - Action Meter score
 * - verdict/badge
 * - classification conclusions
 * - Essential 411 narrative
 * - alternatives
 *
 * Mutable facts such as pricing or complaint conditions survive only
 * as historical leads. Current Gemini research must verify them again.
 */
function compactHistoricalState(record) {
  const report =
    record?.reportSnapshot || {};

  const identity =
    report.solicitation_identity || {};

  const technical =
    report.technical_ledger || {};

  const network =
    technical.network_telemetry || {};

  const monetization =
    technical.monetization || {};

  const regulatory =
    technical.regulatory_record || {};

  return {
    observedAt:
      timestampToText(
        record.lastSeenAt
      ),
    firstSeenAt:
      timestampToText(
        record.firstSeenAt
      ),
    state:
      record.state || {},

    identity: {
      canonicalName:
        cleanText(
          identity.canonical_name
        ),
      operator:
        cleanText(
          identity.operator
        ),
      destinationDomain:
        cleanText(
          identity.destination_domain
        ),
      confidence:
        cleanText(
          identity.confidence
        ),
    },

    network: {
      appPackageOrDomain:
        cleanText(
          network.app_package_or_domain
        ),
      hostCdn:
        cleanText(
          network.host_cdn
        ),
      domainAgeDays:
        Number.isInteger(
          network.domain_age_days
        )
          ? network.domain_age_days
          : null,
      tlsCertificateStatus:
        cleanText(
          network.tls_certificate_status
        ),
    },

    monetization: {
      revenueModel:
        cleanText(
          monetization.revenue_model
        ),
      pricing:
        cleanText(
          monetization.pricing
        ),
      affiliateDisclosure:
        cleanText(
          monetization.affiliate_disclosure
        ),
      guaranteeTerms:
        cleanText(
          monetization.guarantee_terms
        ),
    },

    regulatory: {
      licenseStatus:
        cleanText(
          regulatory.license_status
        ),
      bbbRecord:
        cleanText(
          regulatory.bbb_record
        ),
      ftcRecord:
        cleanText(
          regulatory.ftc_record
        ),
      complaintPattern:
        cleanText(
          regulatory.complaint_pattern
        ),
      reviewSpread:
        cleanText(
          regulatory.review_spread
        ),
    },

    groundingSources:
      cleanList(
        network.grounding_sources,
        MAX_SOURCES_PER_STATE
      ),
    evidenceReceipts:
      compactEvidenceReceipts(
        report
      ),
  };
}

module.exports = {
  compactHistoricalState,
};

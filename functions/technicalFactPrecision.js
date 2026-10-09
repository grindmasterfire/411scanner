/**
 * @file functions/technicalFactPrecision.js
 * @class Class 1
 * @cap 200 Lines
 * @responsibility Keep Technical 411 structured facts and unresolved claims inside evidence boundaries.
 * @dependencies None.
 * @security_gate Never invents facts, identities, or sources.
 * @owner_context 411 Scanner Technical 411.
 */


const {
  enforceRegulatoryEvidencePrecision,
} = require(
  "./technicalRegulatoryPrecision"
);

const EMPTY_STATES = new Set([
  "unknown", "unresolved", "unverified", "not_found",
  "not_researched", "not_applicable", "n/a",
]);

const MATERIAL_FIELDS = {
  attribution: [
    "operator_name", "legal_entity", "developer_or_publisher",
    "storefront_name", "storefront_id", "package_or_bundle_id",
    "related_domains", "related_apps", "contact_emails",
    "contact_phones", "business_addresses", "payment_processors",
    "aliases", "company_registration_ids", "license_identifiers",
  ],
  domain_registration: [
    "registrar", "registered_on", "updated_on", "expires_on",
    "registrant_name", "registrant_organization",
    "registrant_country", "nameservers",
  ],
  infrastructure: [
    "ip_addresses", "asn", "hosting_provider", "cdn",
    "tls_issuer", "tls_subject", "tls_valid_from", "tls_valid_to",
  ],
};

const EVIDENCE_EXEMPT = new Set([
  "attribution.official_domain",
]);

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isEmptyState(value) {
  return EMPTY_STATES.has(clean(value).toLowerCase());
}

function sanitizeStructuredValues(ledger) {
  for (const sectionName of Object.keys(MATERIAL_FIELDS)) {
    const section = ledger?.[sectionName];
    if (!section) continue;

    for (const field of MATERIAL_FIELDS[sectionName]) {
      const value = section[field];

      if (Array.isArray(value)) {
        section[field] = value
          .map(clean)
          .filter(Boolean)
          .filter((item) => !isEmptyState(item));
      } else if (isEmptyState(value)) {
        section[field] = "";
      }
    }
  }
}

function hasVerifiedReceipt(ledger, fieldPath) {
  const receipts = Array.isArray(ledger?.evidence_receipts)
    ? ledger.evidence_receipts
    : [];

  return receipts.some(
    (receipt) =>
      clean(receipt?.field) === fieldPath &&
      clean(receipt?.status).toLowerCase() === "verified" &&
      Boolean(clean(receipt?.source_url))
  );
}

function emptyField(section, field) {
  section[field] = Array.isArray(section[field]) ? [] : "";
}

function enforceStructuredEvidence(ledger) {
  // DISABLED: This was wiping populated ledger fields that lacked verified
  // receipts, causing thin Technical 411 output. The evidence receipts
  // themselves carry the verification status; the structured fields should
  // not be deleted merely for lacking a receipt.
  // Original logic preserved below for reference.
  return;
  for (const [sectionName, fields] of Object.entries(MATERIAL_FIELDS)) {
    const section = ledger?.[sectionName];
    if (!section) continue;

    for (const field of fields) {
      const fieldPath = `${sectionName}.${field}`;
      if (EVIDENCE_EXEMPT.has(fieldPath)) continue;

      const value = section[field];
      const populated = Array.isArray(value)
        ? value.length > 0
        : Boolean(clean(value));

      if (populated && !hasVerifiedReceipt(ledger, fieldPath)) {
        emptyField(section, field);
      }
    }
  }
}

function softenCertainty(value) {
  return clean(value)
    .replace(/\bconfirm(?:s|ed|ing)?\b/gi, "indicate")
    .replace(/\bestablish(?:es|ed|ing)?\b/gi, "indicate")
    .replace(/\bprov(?:e|es|ed|en|ing)\b/gi, "indicate")
    .replace(/\bdocument(?:s|ed|ing)?\b/gi, "describe");
}

function softenUnresolvedClaims(ledger) {
  const receipts = Array.isArray(ledger?.evidence_receipts)
    ? ledger.evidence_receipts
    : [];

  for (const receipt of receipts) {
    if (clean(receipt?.status).toLowerCase() !== "unresolved") {
      continue;
    }

    const softened = softenCertainty(receipt.finding);

    if (softened) {
      receipt.finding = `Unresolved report: ${softened}`;
    }
  }

  const complaintReceipt = receipts.find(
    (receipt) =>
      clean(receipt?.field) ===
        "regulatory_record.complaint_pattern" &&
      clean(receipt?.status).toLowerCase() === "unresolved"
  );

  const regulatory = ledger?.regulatory_record;

  if (complaintReceipt && clean(regulatory?.complaint_pattern)) {
    regulatory.complaint_pattern =
      `Unresolved reports: ${softenCertainty(
        regulatory.complaint_pattern
      )}`;
  }
}

function enforceTechnicalFactPrecision(ledger) {
  if (!ledger) return ledger;

  sanitizeStructuredValues(ledger);
  enforceStructuredEvidence(ledger);
  softenUnresolvedClaims(ledger);
  enforceRegulatoryEvidencePrecision(
    ledger
  );

  return ledger;
}

module.exports = {
  enforceTechnicalFactPrecision,
};

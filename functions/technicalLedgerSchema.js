/**
 * @file functions/technicalLedgerSchema.js
 * @class Class 2
 * @cap 250 Lines
 * @responsibility Define Technical 411 display fields and structured evidence-receipt response contracts.
 * @dependencies None.
 * @security_gate Model-proposed evidence is not trusted by schema alone; technicalLedgerEvidence.js validates receipts against provider-grounded sources.
 * @owner_context 411 Scanner Technical 411 response contract.
 *
 * Evidence receipt status vocabulary:
 * - verified
 * - not_found
 * - not_applicable
 * - unresolved
 * - not_researched
 *
 * Legacy Technical 411 text fields remain present for current Android
 * rendering while evidence receipts become the machine-readable authority.
 */

const {
  TECHNICAL_ATTRIBUTION_SCHEMA,
  DOMAIN_REGISTRATION_SCHEMA,
  INFRASTRUCTURE_SCHEMA,
} = require("./technicalAttributionSchema");

const EVIDENCE_RECEIPT_SCHEMA = {
  type: "object",

  properties: {
    field: {
      type: "string"
    },

    status: {
      type: "string"
    },

    finding: {
      type: "string"
    },

    authority: {
      type: "string"
    },

    subject: {
      type: "string"
    },

    identifier: {
      type: "string"
    },

    source_url: {
      type: "string"
    }
  },

  required: [
    "field",
    "status",
    "finding",
    "authority",
    "subject",
    "identifier",
    "source_url"
  ]
};

const TECHNICAL_LEDGER_SCHEMA = {
  type: "object",

  properties: {

    attribution:
      TECHNICAL_ATTRIBUTION_SCHEMA,

    domain_registration:
      DOMAIN_REGISTRATION_SCHEMA,

    infrastructure:
      INFRASTRUCTURE_SCHEMA,

    network_telemetry: {
      type: "object",

      properties: {
        app_package_or_domain: {
          type: "string"
        },

        host_cdn: {
          type: "string"
        },

        domain_age_days: {
          type: "integer",
          nullable: true
        },

        tls_certificate_status: {
          type: "string",
          nullable: true
        },

        /*
         * Gemini may propose these for schema completeness, but the server
         * replaces them with provider-grounded destinations before trust.
         */
        grounding_sources: {
          type: "array",
          items: {
            type: "string"
          }
        }
      },

      required: [

        "app_package_or_domain",
        "host_cdn",
        "grounding_sources"
      ]
    },

    monetization: {
      type: "object",

      properties: {
        revenue_model: {
          type: "string"
        },

        pricing: {
          type: "string"
        },

        affiliate_disclosure: {
          type: "string"
        },

        guarantee_terms: {
          type: "string"
        }
      },

      required: [
        "revenue_model",
        "pricing",
        "affiliate_disclosure",
        "guarantee_terms"
      ]
    },

    regulatory_record: {
      type: "object",

      properties: {
        license_status: {
          type: "string"
        },

        bbb_record: {
          type: "string"
        },

        ftc_record: {
          type: "string"
        },

        complaint_pattern: {
          type: "string"
        },

        review_spread: {
          type: "string"
        }
      },

      required: [
        "license_status",
        "bbb_record",
        "ftc_record",
        "complaint_pattern",
        "review_spread"
      ]
    },

    evidence_receipts: {
      type: "array",
      items:
        EVIDENCE_RECEIPT_SCHEMA
    },

    technical_flags: {
      type: "array",
      items: {
        type: "string"
      }
    },

    /*
     * Deterministic redirect-chain evidence written by applyRedirectPath.
     * Optional — absent when no link was submitted or resolved.
     * WHY: must be in schema so Firestore serialization and Android parsers
     * receive it. Was absent post-revert — Android RedirectPath models exist
     * but got empty defaults because the field was never in the contract.
     */
    redirect_path: {
      type: "object",
      properties: {
        submitted_url:      { type: "string" },
        normalized_url:     { type: "string" },
        final_destination:  { type: "string" },
        final_domain:       { type: "string" },
        shortener_identity: { type: "string", nullable: true },
        hops: {
          type: "array",
          items: {
            type: "object",
            properties: {
              url:         { type: "string" },
              status_code: { type: "integer", nullable: true },
              hop_index:   { type: "integer" }
            }
          }
        },
        tracking_parameters: {
          type: "array",
          items: { type: "string" }
        }
      }
    },

    /*
     * Consumer / complaint / review evidence. Separated from regulatory_record:
     * BBB and Trustpilot are NOT regulatory records. Optional — populates
     * when Gemini finds consumer evidence.
     */
    consumer_evidence: {
      type: "object",
      properties: {
        bbb_record: { type: "string" },
        trustpilot: { type: "string" },
        complaint_pattern: { type: "string" },
        review_spread: { type: "string" }
      }
    }
  },

  required: [
    "attribution",
    "domain_registration",
    "infrastructure",
    "network_telemetry",
    "monetization",
    "regulatory_record",
    "evidence_receipts",
    "technical_flags"
  ]
};

module.exports = {
  TECHNICAL_LEDGER_SCHEMA
};

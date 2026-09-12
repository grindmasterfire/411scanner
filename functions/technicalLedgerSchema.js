/**
 * @file functions/technicalLedgerSchema.js
 * @class Class 1
 * @cap 150 Lines
 * @responsibility Define the technical-ledger response schema.
 * @dependencies None.
 * @security_gate Schema only.
 */

const TECHNICAL_LEDGER_SCHEMA = {
  type: "object",

  properties: {
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

    technical_flags: {
      type: "array",
      items: {
        type: "string"
      }
    }
  },

  required: [
    "network_telemetry",
    "monetization",
    "regulatory_record",
    "technical_flags"
  ]
};

module.exports = {
  TECHNICAL_LEDGER_SCHEMA
};
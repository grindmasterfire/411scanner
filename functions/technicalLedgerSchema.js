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

        ftc_record: {
          type: "string"
        }
      },

      required: [
        "license_status",
        "ftc_record"
      ]
    },

    /*
     * Consumer / complaint / review evidence. Separated from regulatory_record
     * per canonical spec: BBB and Trustpilot are NOT regulatory records.
     * Consumer sentiment is evidence, not arithmetic.
     */
    consumer_evidence: {
      type: "object",

      properties: {
        bbb_record: {
          type: "string"
        },

        trustpilot: {
          type: "string"
        },

        complaint_pattern: {
          type: "string"
        },

        review_spread: {
          type: "string"
        },

        complaint_boards: {
          type: "array",
          items: {
            type: "string"
          }
        }
      },

      required: [
        "bbb_record",
        "trustpilot",
        "complaint_pattern",
        "review_spread"
      ]
    },

    /*
     * Redirect / action-link path. Deterministic solicitation-path evidence
     * from linkResolver.js. A shortener must not become the end of the
     * investigation merely because search grounding cannot index the final
     * destination.
     */
    redirect_path: {
      type: "object",

      properties: {
        submitted_url: {
          type: "string"
        },

        normalized_url: {
          type: "string"
        },

        hops: {
          type: "array",
          items: {
            type: "object",
            properties: {
              url: { type: "string" },
              status_code: { type: "integer", nullable: true },
              hop_index: { type: "integer" }
            }
          }
        },

        final_destination: {
          type: "string"
        },

        final_domain: {
          type: "string"
        },

        shortener_identity: {
          type: "string",
          nullable: true
        },

        tracking_parameters: {
          type: "array",
          items: {
            type: "string"
          }
        }
      },

      required: [
        "submitted_url",
        "normalized_url",
        "hops",
        "final_destination",
        "final_domain"
      ]
    },

    /*
     * Tracking & technical identity. Deterministic identifiers that link
     * this solicitation to infrastructure, campaigns, or actors.
     * Pattern similarity must not be converted into actor identity.
     */
    tracking_identity: {
      type: "object",

      properties: {
        tracking_ids: {
          type: "object",
          description: "Map of tracker name to list of IDs found"
        },

        affiliate_identifiers: {
          type: "array",
          items: { type: "string" }
        },

        package_hashes: {
          type: "array",
          items: { type: "string" }
        },

        sdk_fingerprints: {
          type: "array",
          items: { type: "string" }
        }
      },

      required: []
    },

    /*
     * Data / account / access requirements. What the solicitation demands
     * from the user before delivering value.
     */
    data_requirements: {
      type: "object",

      properties: {
        account_requirement: { type: "string" },
        kyc_requirement: { type: "string" },
        personal_data_collection: { type: "string" },
        sensitive_data_collection: { type: "string" },
        app_permissions: {
          type: "array",
          items: { type: "string" }
        }
      },

      required: []
    },

    /*
     * Campaign / solicitation continuity. Links this solicitation to prior
     * or related campaigns. Confidence levels: CONFIRMED, RELATED,
     * PATTERN_ONLY, UNKNOWN. Never convert similar mechanics into common
     * ownership.
     */
    campaign_continuity: {
      type: "object",

      properties: {
        reused_domains: {
          type: "array",
          items: { type: "string" }
        },

        reused_tracking_ids: {
          type: "array",
          items: { type: "string" }
        },

        related_offers: {
          type: "array",
          items: { type: "string" }
        },

        confidence: {
          type: "string"
        }
      },

      required: []
    },

    /*
     * Blockchain / Web3 / financial infrastructure. On-chain evidence
     * where applicable. Do not invent relationships from naming similarity.
     */
    blockchain: {
      type: "object",

      properties: {
        wallet_addresses: {
          type: "array",
          items: { type: "string" }
        },

        contract_addresses: {
          type: "array",
          items: { type: "string" }
        },

        chain: { type: "string" },

        token_evidence: { type: "string" }
      },

      required: []
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

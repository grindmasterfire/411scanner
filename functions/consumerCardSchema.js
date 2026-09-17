/**
 * @file functions/consumerCardSchema.js
 * @class Class 2
 * @cap 250 Lines
 * @responsibility Define Consumer 411 metrics, Action Meter calibration context, and Floor-Raiser evidence contracts.
 * @dependencies None.
 * @security_gate Gemini supplies evidence and qualitative signals only; server owns final Action Meter authority.
 * @owner_context 411 Scanner Consumer Card response contract.
 *
 * Canonical metric semantics:
 * - Financial Risk, Personal Data Exposure, Wasted Time & Ads: lower is better.
 * - Real Substance & Depth, Practical Utility, Honest Business Model: higher is better.
 *
 * Calibration migration:
 * New reports use practical_utility and honest_business_model.
 * Legacy cache reports using offline_independence / honest_pricing remain
 * readable through server/client compatibility fallbacks.
 */

const EVIDENCE_LIST_SCHEMA = {
  type: "array",
  items: { type: "string" }
};

const FLOOR_RAISER_FIELDS = [
  "rebrand_pattern",
  "advance_fee",
  "federal_impersonation",
  "confirmed_criminal",
  "near_threshold_suspension",
  "withdrawal_gate",
  "ip_hostage_lock_in",
  "ad_arbitrage_mfa_lure"
];

const ACTION_CONTEXT_FIELDS = [
  "crypto_participation",
  "automated_financial_execution",
  "professional_financial_complexity",
  "consumer_disengagement_boundary"
];

const ACTION_METER_CONTEXT_SCHEMA = {
  type: "object",

  properties: {
    crypto_participation: {
      type: "boolean"
    },

    automated_financial_execution: {
      type: "boolean"
    },

    professional_financial_complexity: {
      type: "boolean"
    },

    consumer_disengagement_boundary: {
      type: "boolean"
    },

    evidence: {
      type: "object",

      properties: {
        crypto_participation:
          EVIDENCE_LIST_SCHEMA,

        automated_financial_execution:
          EVIDENCE_LIST_SCHEMA,

        professional_financial_complexity:
          EVIDENCE_LIST_SCHEMA,

        consumer_disengagement_boundary:
          EVIDENCE_LIST_SCHEMA
      },

      required:
        ACTION_CONTEXT_FIELDS
    }
  },

  required: [
    ...ACTION_CONTEXT_FIELDS,
    "evidence"
  ]
};

const FLOOR_RAISER_SCHEMA = {
  type: "object",

  properties: {
    rebrand_pattern: { type: "boolean" },
    advance_fee: { type: "boolean" },
    federal_impersonation: { type: "boolean" },
    confirmed_criminal: { type: "boolean" },
    near_threshold_suspension: { type: "boolean" },
    withdrawal_gate: { type: "boolean" },
    ip_hostage_lock_in: { type: "boolean" },
    ad_arbitrage_mfa_lure: { type: "boolean" }
  },

  required:
    FLOOR_RAISER_FIELDS
};

const FLOOR_RAISER_EVIDENCE_SCHEMA = {
  type: "object",

  properties: {
    rebrand_pattern:
      EVIDENCE_LIST_SCHEMA,

    advance_fee:
      EVIDENCE_LIST_SCHEMA,

    federal_impersonation:
      EVIDENCE_LIST_SCHEMA,

    confirmed_criminal:
      EVIDENCE_LIST_SCHEMA,

    near_threshold_suspension:
      EVIDENCE_LIST_SCHEMA,

    withdrawal_gate:
      EVIDENCE_LIST_SCHEMA,

    ip_hostage_lock_in:
      EVIDENCE_LIST_SCHEMA,

    ad_arbitrage_mfa_lure:
      EVIDENCE_LIST_SCHEMA
  },

  required:
    FLOOR_RAISER_FIELDS
};

const CONSUMER_CARD_SCHEMA = {
  type: "object",

  properties: {
    target_name: { type: "string" },
    developer_or_entity: { type: "string" },
    interface_surface: { type: "string" },

    classification_badges: {
      type: "array",
      items: { type: "string" }
    },

    metrics: {
      type: "object",

      properties: {
        financial_risk: {
          type: "integer"
        },

        personal_data_exposure: {
          type: "integer"
        },

        wasted_time_and_ads: {
          type: "integer"
        },

        real_substance: {
          type: "integer"
        },

        practical_utility: {
          type: "integer"
        },

        honest_business_model: {
          type: "integer"
        }
      },

      required: [
        "financial_risk",
        "personal_data_exposure",
        "wasted_time_and_ads",
        "real_substance",
        "practical_utility",
        "honest_business_model"
      ]
    },

    metric_annotations: {
      type: "object",

      properties: {
        financial_risk_note: {
          type: "string"
        },

        personal_data_note: {
          type: "string"
        },

        wasted_time_note: {
          type: "string"
        },

        real_substance_note: {
          type: "string"
        },

        practical_utility_note: {
          type: "string"
        },

        honest_business_model_note: {
          type: "string"
        }
      },

      required: [
        "financial_risk_note",
        "personal_data_note",
        "wasted_time_note",
        "real_substance_note",
        "practical_utility_note",
        "honest_business_model_note"
      ]
    },

    action_meter_context:
      ACTION_METER_CONTEXT_SCHEMA,

    action_meter_score: {
      type: "number"
    },

    action_verdict_badge: {
      type: "string"
    },

    verdict_label: {
      type: "string"
    },

    tagline: {
      type: "string"
    },

    essential_411: {
      type: "string"
    },

    secondary_targets_note: {
      type: "string"
    },

    floor_raisers:
      FLOOR_RAISER_SCHEMA,

    floor_raiser_evidence:
      FLOOR_RAISER_EVIDENCE_SCHEMA
  },

  required: [
    "target_name",
    "developer_or_entity",
    "interface_surface",
    "classification_badges",
    "metrics",
    "metric_annotations",
    "action_meter_context",
    "action_meter_score",
    "action_verdict_badge",
    "verdict_label",
    "tagline",
    "essential_411",
    "secondary_targets_note",
    "floor_raisers",
    "floor_raiser_evidence"
  ]
};

module.exports = {
  CONSUMER_CARD_SCHEMA
};

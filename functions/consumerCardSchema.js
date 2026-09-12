/**
 * @file functions/consumerCardSchema.js
 * @class Class 1
 * @cap 150 Lines
 * @responsibility Define the consumer-card response schema.
 * @dependencies None.
 * @security_gate Schema only. Server owns Action Meter.
 */

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
        financial_risk: { type: "integer" },
        personal_data_exposure: { type: "integer" },
        wasted_time_and_ads: { type: "integer" },
        real_substance: { type: "integer" },
        offline_independence: { type: "integer" },
        honest_pricing: { type: "integer" }
      },
      required: [
        "financial_risk",
        "personal_data_exposure",
        "wasted_time_and_ads",
        "real_substance",
        "offline_independence",
        "honest_pricing"
      ]
    },

    metric_annotations: {
      type: "object",
      properties: {
        financial_risk_note: { type: "string" },
        personal_data_note: { type: "string" },
        wasted_time_note: { type: "string" },
        real_substance_note: { type: "string" },
        offline_independence_note: { type: "string" },
        honest_pricing_note: { type: "string" }
      },
      required: [
        "financial_risk_note",
        "personal_data_note",
        "wasted_time_note",
        "real_substance_note",
        "offline_independence_note",
        "honest_pricing_note"
      ]
    },

    action_meter_score: { type: "number" },
    action_verdict_badge: { type: "string" },
    verdict_label: { type: "string" },
    tagline: { type: "string" },
    essential_411: { type: "string" },
    secondary_targets_note: { type: "string" },

    floor_raisers: {
      type: "object",
      properties: {
        rebrand_pattern: { type: "boolean" },
        advance_fee: { type: "boolean" },
        federal_impersonation: { type: "boolean" },
        confirmed_criminal: { type: "boolean" },
        near_threshold_suspension: { type: "boolean" },
        withdrawal_gate: { type: "boolean" }
      },
      required: [
        "rebrand_pattern",
        "advance_fee",
        "federal_impersonation",
        "confirmed_criminal",
        "near_threshold_suspension",
        "withdrawal_gate"
      ]
    }
  },

  required: [
    "target_name",
    "developer_or_entity",
    "interface_surface",
    "classification_badges",
    "metrics",
    "metric_annotations",
    "action_meter_score",
    "action_verdict_badge",
    "verdict_label",
    "tagline",
    "essential_411"
  ]
};

module.exports = {
  CONSUMER_CARD_SCHEMA
};
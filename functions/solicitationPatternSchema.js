/**
 * @file functions/solicitationPatternSchema.js
 * @class Class 1
 * @cap 150 Lines
 * @responsibility Define the T03 solicitation-pattern schema.
 * @dependencies None.
 * @security_gate Pattern recognition cannot establish actor identity.
 */

const SOLICITATION_PATTERN_SCHEMA = {
  type: "object",

  properties: {
    solicitation_type: {
      type: "string"
    },

    offer_or_request: {
      type: "string"
    },

    requested_action: {
      type: "string"
    },

    mechanics: {
      type: "array",
      items: {
        type: "string"
      }
    },

    behavioral_signals: {
      type: "array",
      items: {
        type: "string"
      }
    },

    footprint_status: {
      type: "string",
      enum: [
        "established",
        "limited",
        "absent",
        "unknown"
      ]
    },

    pattern_assessment: {
      type: "string",
      enum: [
        "ordinary",
        "suspicious",
        "deceptive_pattern",
        "insufficient_evidence"
      ]
    },

    confidence: {
      type: "string",
      enum: [
        "high",
        "medium",
        "low",
        "unknown"
      ]
    }
  },

  required: [
    "solicitation_type",
    "offer_or_request",
    "requested_action",
    "mechanics",
    "behavioral_signals",
    "footprint_status",
    "pattern_assessment",
    "confidence"
  ]
};

module.exports = {
  SOLICITATION_PATTERN_SCHEMA
};
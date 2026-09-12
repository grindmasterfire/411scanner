/**
 * @file functions/geminiResponseSchema.js
 * @class Class 1
 * @cap 150 Lines
 * @responsibility Compose the atomic Gemini response schemas.
 * @dependencies Atomic response-schema modules.
 * @security_gate Composition only; server calculations remain authoritative.
 *
 * T03:
 * solicitation_identity and solicitation_pattern are separate records.
 */

const {
  CONSUMER_CARD_SCHEMA,
} = require("./consumerCardSchema");

const {
  SOLICITATION_IDENTITY_SCHEMA,
} = require("./solicitationIdentitySchema");

const {
  SOLICITATION_PATTERN_SCHEMA,
} = require("./solicitationPatternSchema");

const {
  TECHNICAL_LEDGER_SCHEMA,
} = require("./technicalLedgerSchema");

const {
  ALTERNATIVES_SCHEMA,
} = require("./alternativesSchema");

const RESPONSE_SCHEMA = {
  type: "object",

  properties: {
    consumer_card:
      CONSUMER_CARD_SCHEMA,

    solicitation_identity:
      SOLICITATION_IDENTITY_SCHEMA,

    solicitation_pattern:
      SOLICITATION_PATTERN_SCHEMA,

    technical_ledger:
      TECHNICAL_LEDGER_SCHEMA,

    alternatives:
      ALTERNATIVES_SCHEMA
  },

  required: [
    "consumer_card",
    "solicitation_identity",
    "solicitation_pattern",
    "technical_ledger",
    "alternatives"
  ]
};

module.exports = {
  RESPONSE_SCHEMA
};
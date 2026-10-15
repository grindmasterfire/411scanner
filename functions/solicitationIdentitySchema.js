/**
 * @file functions/solicitationIdentitySchema.js
 * @class Class 1
 * @cap 150 Lines
 * @responsibility Define the actor-identity response schema.
 * @dependencies None.
 * @security_gate Does not establish identity.
 *
 * T03 boundary:
 * This schema is separate from solicitation_pattern.
 */

const SOLICITATION_IDENTITY_SCHEMA = {
  type: "object",

  properties: {
    canonical_name: {
      type: "string"
    },

    operator: {
      type: "string"
    },

    destination_domain: {
      type: "string"
    },

    destination_path: {
      type: "string"
    },

    offer_mechanic: {
      type: "string"
    },
    // How the solicitation reached the user; catalogs the Cache Bank.
    // Plain string: the response schema sits at Gemini's size limit (an
    // enum or more fields here is rejected with 400). Email sender details
    // are extracted server-side from the OCR text (emailSender.js).
    channel: {
      type: "string"
    },

    confidence: {
      type: "string",
      enum: [
        "confirmed",
        "related",
        "pattern_only",
        "unknown"
      ]
    }
  },

  required: [
    "canonical_name",
    "operator",
    "destination_domain",
    "destination_path",
    "offer_mechanic",
    "confidence"
  ]
};

module.exports = {
  SOLICITATION_IDENTITY_SCHEMA
};
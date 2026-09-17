/**
 * @file functions/alternativesSchema.js
 * @class Class 1
 * @cap 150 Lines
 * @responsibility Define lightweight target-access and discovery output from the existing crawl.
 * @dependencies None.
 * @security_gate Alternatives are discovery only. They are not 411-scored, vetted, endorsed, or recursively researched.
 *
 * T06 boundary:
 * Gemini may report an opportunity only when it naturally emerges from the
 * grounded crawl already being performed for the submitted target.
 *
 * The model must not launch additional research solely to populate discovery.
 * Commercial inventory and presentation bands remain server/application owned.
 */

const DISCOVERY_ITEM_SCHEMA = {
  type: "object",

  properties: {
    name: {
      type: "string"
    },

    destination_url: {
      type: "string"
    },

    relationship: {
      type: "string",
      enum: [
        "comparative",
        "complementary",
        "adjacent",
        "probabilistic",
        "related_campaign",
        "other"
      ]
    },

    description: {
      type: "string"
    }
  },

  required: [
    "name",
    "destination_url",
    "relationship",
    "description"
  ]
};

const ALTERNATIVES_SCHEMA = {
  type: "object",

  properties: {
    /*
     * These belong only to the target that received the actual 411.
     * Empty strings are required when no verified contact was established.
     */
    verified_links: {
      type: "object",

      properties: {
        official_site: {
          type: "string"
        },

        real_phone: {
          type: "string"
        },

        real_email: {
          type: "string"
        }
      },

      required: [
        "official_site",
        "real_phone",
        "real_email"
      ]
    },

    /*
     * Discovery is intentionally lightweight.
     *
     * No Action Meter estimate, six vectors, verification badge,
     * community-tag generation, or recursive 411 belongs here.
     */
    discovery_items: {
      type: "array",
      items: DISCOVERY_ITEM_SCHEMA
    }
  },

  required: [
    "verified_links",
    "discovery_items"
  ]
};

module.exports = {
  ALTERNATIVES_SCHEMA
};

/**
 * @file functions/alternativesSchema.js
 * @class Class 1
 * @cap 150 Lines
 * @responsibility Define the alternatives response schema.
 * @dependencies None.
 * @security_gate Schema only.
 */

const ALTERNATIVES_SCHEMA = {
  type: "object",

  properties: {
    renders: {
      type: "boolean"
    },

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
      }
    },

    recommended_alternatives: {
      type: "array",

      items: {
        type: "object",

        properties: {
          name: {
            type: "string"
          },

          score_estimate: {
            type: "string"
          },

          description: {
            type: "string"
          }
        }
      }
    },

    community_tags: {
      type: "array",
      items: {
        type: "string"
      }
    }
  },

  required: [
    "renders",
    "recommended_alternatives",
    "community_tags"
  ]
};

module.exports = {
  ALTERNATIVES_SCHEMA
};
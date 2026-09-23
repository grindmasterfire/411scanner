/**
 * @file functions/technicalAttributionSchema.js
 * @class Class 2
 * @cap 250 Lines
 * @responsibility Define investigator-grade Technical 411 attribution,
 * domain-registration, and infrastructure response contracts.
 * @dependencies None.
 * @security_gate Facts remain model proposals until evidence governance
 * and provider-grounded validation establish authority.
 * @owner_context 411 Scanner Technical 411.
 */

const STRING_ARRAY_SCHEMA = {
  type: "array",
  items: {
    type: "string",
  },
};

const TECHNICAL_ATTRIBUTION_SCHEMA = {
  type: "object",

  properties: {
    operator_name: {
      type: "string",
    },

    legal_entity: {
      type: "string",
    },

    developer_or_publisher: {
      type: "string",
    },

    storefront_name: {
      type: "string",
    },

    storefront_id: {
      type: "string",
    },

    package_or_bundle_id: {
      type: "string",
    },

    official_domain: {
      type: "string",
    },

    related_domains: STRING_ARRAY_SCHEMA,
    related_apps: STRING_ARRAY_SCHEMA,
    contact_emails: STRING_ARRAY_SCHEMA,
    contact_phones: STRING_ARRAY_SCHEMA,
    business_addresses: STRING_ARRAY_SCHEMA,
    payment_processors: STRING_ARRAY_SCHEMA,
    aliases: STRING_ARRAY_SCHEMA,
    company_registration_ids: STRING_ARRAY_SCHEMA,
    license_identifiers: STRING_ARRAY_SCHEMA,
  },

  required: [
    "operator_name",
    "legal_entity",
    "developer_or_publisher",
    "storefront_name",
    "storefront_id",
    "package_or_bundle_id",
    "official_domain",
    "related_domains",
    "related_apps",
    "contact_emails",
    "contact_phones",
    "business_addresses",
    "payment_processors",
    "aliases",
    "company_registration_ids",
    "license_identifiers",
  ],
};

const DOMAIN_REGISTRATION_SCHEMA = {
  type: "object",

  properties: {
    registrar: {
      type: "string",
    },

    registered_on: {
      type: "string",
    },

    updated_on: {
      type: "string",
    },

    expires_on: {
      type: "string",
    },

    registrant_name: {
      type: "string",
    },

    registrant_organization: {
      type: "string",
    },

    registrant_country: {
      type: "string",
    },

    nameservers: STRING_ARRAY_SCHEMA,
  },

  required: [
    "registrar",
    "registered_on",
    "updated_on",
    "expires_on",
    "registrant_name",
    "registrant_organization",
    "registrant_country",
    "nameservers",
  ],
};

const INFRASTRUCTURE_SCHEMA = {
  type: "object",

  properties: {
    ip_addresses: STRING_ARRAY_SCHEMA,

    asn: {
      type: "string",
    },

    hosting_provider: {
      type: "string",
    },

    cdn: {
      type: "string",
    },

    tls_issuer: {
      type: "string",
    },

    tls_subject: {
      type: "string",
    },

    tls_valid_from: {
      type: "string",
    },

    tls_valid_to: {
      type: "string",
    },
  },

  required: [
    "ip_addresses",
    "asn",
    "hosting_provider",
    "cdn",
    "tls_issuer",
    "tls_subject",
    "tls_valid_from",
    "tls_valid_to",
  ],
};

module.exports = {
  TECHNICAL_ATTRIBUTION_SCHEMA,
  DOMAIN_REGISTRATION_SCHEMA,
  INFRASTRUCTURE_SCHEMA,
};

const assert = require("node:assert/strict");

const {
  normalizeTechnicalEvidence,
} = require("../technicalLedgerEvidence");

const {
  enforceTechnicalFactPrecision,
} = require("../technicalFactPrecision");

(async () => {

const directUrl =
  "https://example.gov/record/123";

const direct = {
  technical_ledger: {
    attribution: {
      aliases: ["Alias One"],
      company_registration_ids: ["REG-123"],
      license_identifiers: ["LIC-456"],
    },
    evidence_receipts: [
      {
        field: "attribution.aliases",
        status: "verified",
        finding: "Alias One verified",
        source_url: directUrl,
      },
      {
        field: "attribution.company_registration_ids",
        status: "verified",
        finding: "REG-123 verified",
        source_url: directUrl,
      },
      {
        field: "attribution.license_identifiers",
        status: "verified",
        finding: "LIC-456 verified",
        source_url: directUrl,
      },
    ],
    network_telemetry: {},
  },
};

await normalizeTechnicalEvidence(
  direct,
  {
    sources: [
      {
        uri: directUrl,
        title: "Official Record",
      },
    ],
  }
);

enforceTechnicalFactPrecision(
  direct.technical_ledger
);

assert.deepEqual(
  direct.technical_ledger.attribution.aliases,
  ["Alias One"]
);

assert.deepEqual(
  direct.technical_ledger.attribution.company_registration_ids,
  ["REG-123"]
);

assert.deepEqual(
  direct.technical_ledger.attribution.license_identifiers,
  ["LIC-456"]
);

const wrapper =
  "https://vertexaisearch.cloud.google.com/" +
  "grounding-api-redirect/example";

const blocked = {
  technical_ledger: {
    attribution: {
      aliases: ["Unsupported Alias"],
    },
    evidence_receipts: [
      {
        field: "attribution.aliases",
        status: "verified",
        finding: "Unsupported Alias",
        source_url: wrapper,
      },
    ],
    network_telemetry: {},
  },
};

await normalizeTechnicalEvidence(
  blocked,
  {
    sources: [
      {
        uri: wrapper,
        title: "Provider Redirect",
      },
    ],
  }
);

enforceTechnicalFactPrecision(
  blocked.technical_ledger
);

assert.equal(
  blocked.technical_ledger.evidence_receipts[0].status,
  "unresolved"
);

// Restoration: the source URL is preserved (not wiped) when downgraded.
// The Android client filters redirect URLs from Inspect Source destinations.
// The evidence trail must survive even when the claim is unresolved.
assert.equal(
  blocked.technical_ledger.evidence_receipts[0].source_url,
  wrapper
);

assert.deepEqual(
  blocked.technical_ledger.attribution.aliases,
  ['Unsupported Alias']
);

assert.deepEqual(
  blocked.technical_ledger.network_telemetry.grounding_sources,
  []
);

const resolvedUrl =
  "https://example.gov/resolved/456";

const resolved = {
  technical_ledger: {
    evidence_receipts: [
      {
        field: "attribution.aliases",
        status: "verified",
        finding: "Resolved Alias",
        source_url: wrapper,
      },
    ],
    network_telemetry: {},
  },
};

await normalizeTechnicalEvidence(
  resolved,
  {
    sources: [
      {
        uri: wrapper,
        resolvedUri: resolvedUrl,
        title: "Resolved Record",
      },
    ],
  }
);

assert.equal(
  resolved.technical_ledger.evidence_receipts[0].status,
  "verified"
);

assert.equal(
  resolved.technical_ledger.evidence_receipts[0].source_url,
  resolvedUrl
);

console.log("PASS: T01 Technical source regression");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

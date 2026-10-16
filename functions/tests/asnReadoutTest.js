/**
 * ASN readout (2026-10-16, Hik-Connect): the ASN field holds the network
 * number(s), ASN Organization the operator's name, and the Inspect link the
 * real network. Run: node tests/asnReadoutTest.js
 */
const assert = require("assert");
const { _parseCymruOrigin: parse, applyMeasuredLedger } = require("../networkProbe");

// What Team Cymru returned for 52.5.167.158 (hik-connect.com): two origins.
const hik = parse([["14618 | 52.4.0.0/14 | US | arin | 1991-12-19"], ["16509 | 52.0.0.0/11 | US | arin | 1991-12-19"]]);
assert.deepStrictEqual(hik.asns, ["14618", "16509"]);
assert.strictEqual(hik.asn, "14618");
assert.strictEqual(hik.prefix, "52.4.0.0/14");
assert.strictEqual(hik.country, "US");
// One origin, delivered in chunks.
assert.deepStrictEqual(parse([["13335 | 172.66.160.0/20 ", "| US | arin | 2000-01-01"]]).asns, ["13335"]);
// One record naming two origins (multi-origin AS set).
assert.deepStrictEqual(parse([["16509 14618 | 52.4.0.0/14 | US | arin | 1991-12-19"]]).asns, ["16509", "14618"]);
assert.strictEqual(parse([]), null);
assert.strictEqual(parse([["garbage"]]), null);

// Into the ledger.
const report = { technical_ledger: { evidence_receipts: [] } };
applyMeasuredLedger(report, {
  measured: true, domain: "www.hik-connect.com", apex_domain: "hik-connect.com", ip_addresses: ["52.5.167.158"],
  asn_org: { ...hik, name: "AMAZON-AES - Amazon.com, Inc., US" },
});
const infra = report.technical_ledger.infrastructure;
assert.strictEqual(infra.asn, "14618, 16509");
assert.strictEqual(infra.asn_organization, "AMAZON-AES - Amazon.com, Inc., US", "the operator's name, not the raw lookup line");
assert.strictEqual(infra.asn_country, "US");
assert.ok(!/\|/.test(infra.asn + infra.asn_organization), "no raw lookup text in the fields");
const row = report.technical_ledger.evidence_receipts.find((r) => r.field === "infrastructure.asn");
assert.strictEqual(row.finding, "ASN: AS14618 (AMAZON-AES - Amazon.com, Inc., US); the address is also announced by AS16509.");
assert.strictEqual(row.source_url, "https://bgp.he.net/AS14618");
console.log("asnReadoutTest: all passed");

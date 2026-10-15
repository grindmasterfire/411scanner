/**
 * Registry (RDAP) and hosting receipts from the network probe: measured
 * values replace unconfirmed model guesses, never verified receipts, and a
 * hidden registrant still reports what the registry shows.
 * Run: node tests/probeRegistryReceiptsTest.js
 */
const assert = require("assert");
const { applyMeasuredLedger } = require("../networkProbe");

const probe = {
  measured: true,
  domain: "goodcallmusic.com",
  apex_domain: "goodcallmusic.com",
  host_cdn: "direct (Squarespace)",
  registrar: "Squarespace Domains LLC",
  registrant: { name: "", org: "", street: "", city: "", region: "CA", postal: "", country: "", redacted: true },
  asn_org: { asn: "53831", name: "SQUARESPACE - Squarespace, Inc., US" },
};

const report = { technical_ledger: { evidence_receipts: [
  { field: "domain_registration.registrar", status: "searched_unconfirmed", finding: "model guess" },
  { field: "infrastructure.origin_host", status: "verified", finding: "Grounded: hosted by Squarespace", source_url: "https://x.example" },
] } };
applyMeasuredLedger(report, probe);
const by = Object.fromEntries(report.technical_ledger.evidence_receipts.map((r) => [r.field, r]));

assert.equal(by["domain_registration.registrar"].status, "verified");
assert.match(by["domain_registration.registrar"].finding, /Squarespace Domains LLC/);
assert.match(by["domain_registration.registrar"].source_url, /^https:\/\/lookup\.icann\.org\//);

// The server's measurement owns probe fields, even over a model "verified".
assert.equal(by["infrastructure.origin_host"].authority, "Network Probe");
assert.match(by["infrastructure.origin_host"].finding, /AS53831, operated by SQUARESPACE/);

assert.equal(by["domain_registration.registrant"].status, "searched_redacted");
assert.match(by["domain_registration.registrant"].finding, /location as CA/);
assert.match(by["domain_registration.registrant"].finding, /business records, not WHOIS/);

assert.match(by["infrastructure.host_cdn"].finding, /served directly by its host \(server: Squarespace\)/);

// A registrant the registry shows is verified with the address.
const open = { technical_ledger: { evidence_receipts: [] } };
applyMeasuredLedger(open, { ...probe, registrant: { name: "", org: "Acme LLC", street: "1 Main St", city: "Austin", region: "TX", postal: "78701", country: "US", redacted: false } });
const reg = open.technical_ledger.evidence_receipts.find((r) => r.field === "domain_registration.registrant");
assert.equal(reg.status, "verified");
assert.match(reg.finding, /Acme LLC, 1 Main St, Austin, TX, US, 78701/);

console.log("probeRegistryReceiptsTest: all passed");

// Platform hosts are never probe targets (Walmart LinkedIn scan, 10/15).
const { isPlatformHost } = require("../networkProbe");
for (const h of ["linkedin.com", "www.linkedin.com", "https://www.linkedin.com/company/walmart", "m.facebook.com", "play.google.com", "1drv.ms"]) {
  assert.ok(isPlatformHost(h), h);
}
for (const h of ["walmart.com", "corporate.walmart.com", "goodcallmusic.com", "notlinkedin.com"]) {
  assert.ok(!isPlatformHost(h), h);
}

// Model values never ride under the probe's name.
const mixed = { technical_ledger: {
  infrastructure: { mail_servers: ["mx.walmart.com"], subdomains: ["corporate.walmart.com"] },
  evidence_receipts: [],
} };
applyMeasuredLedger(mixed, { measured: true, domain: "example.org", apex_domain: "example.org", ip_addresses: ["93.184.215.14"] });
const fields = mixed.technical_ledger.evidence_receipts.map((r) => r.field);
assert.ok(fields.includes("infrastructure.ip_addresses"));
assert.ok(!fields.includes("infrastructure.mail_servers"), "unmeasured MX not stamped as probe");
assert.ok(!fields.includes("infrastructure.subdomains"), "unmeasured subdomains not stamped as probe");

console.log("probeRegistryReceiptsTest: platform + provenance passed");

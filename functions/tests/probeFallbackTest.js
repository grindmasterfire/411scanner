/**
 * Probe fallback (2026-10-16, Pro test scans): an Android package name is
 * never probed as a website; a domain the registry doesn't have is reported
 * as not registered, never as "privacy-shielded".
 * Run: node tests/probeFallbackTest.js
 */
const assert = require("assert");
const { isAppPackage } = require("../networkProbe");
const { applyNotRegistered, scrubStateCodes } = require("../registryLedger");
const { reasonTemplate } = require("../technicalLedgerEvidence");

// Package names from the 10/16 app scans (Blossom, Anker, Stackwell).
for (const p of ["com.blossomsocial", "com.oceanwing.soundcore", "com.stackwell.app", "com.particlenews.newsbreak"]) {
  assert.ok(isAppPackage(p), p);
}
for (const d of ["blossomsocial.com", "soundcore.com", "stackwellcapital.com", "newsbreak.com", "www.uac4u.com", "lolympdepositor.com"]) {
  assert.ok(!isAppPackage(d), d);
}

// Olymp Capital: the ad's domain isn't in the registry.
{
  const report = { technical_ledger: {
    domain_registration: { registrar: "", registrant_name: "searched_redacted", registered_on: "searched_redacted" },
    evidence_receipts: [
      { field: "domain_registration.registrant", status: "searched_redacted", finding: "WHOIS registrant identification records for lolympdepositor.com are privacy-shielded." },
      { field: "domain_registration.registrar", status: "searched_not_found", finding: "Direct deterministic connection to lolympdepositor.com failed." },
    ],
  } };
  applyNotRegistered(report, "lolympdepositor.com", "2026-10-16");
  scrubStateCodes(report, reasonTemplate);
  const rows = report.technical_ledger.evidence_receipts;
  const registrar = rows.find((r) => r.field === "domain_registration.registrar");
  const registrant = rows.find((r) => r.field === "domain_registration.registrant");
  assert.match(registrar.finding, /The domain registry has no record of lolympdepositor\.com \(checked 2026-10-16\): it is not registered/);
  assert.match(registrar.finding, /The address on this specimen leads nowhere/);
  assert.strictEqual(registrar.source_url, "https://lookup.icann.org/en/lookup?name=lolympdepositor.com", "an Inspect link the customer can open");
  assert.ok(!/privacy-shielded/.test(registrant.finding), "the invented privacy claim is replaced");
  assert.strictEqual(rows.filter((r) => r.field.startsWith("domain_registration.")).length, 2, "no duplicate rows");
  assert.strictEqual(report.technical_ledger.domain_registration.registered_on, "");
}
console.log("probeFallbackTest: all passed");

// Hik-Connect (2026-10-16): the site answers only on www., and when the site
// can't be reached the registry record must still land in the ledger.
{
  const src = require("fs").readFileSync(require("path").join(__dirname, "..", "scanWorkflow.js"), "utf8");
  assert.ok(src.includes('[domain, `www.${domain}`]'), "the fallback tries www. after the bare domain");
  assert.ok(src.includes('probeStatus = "registry_only"'), "registry facts are kept when the site is unreachable");
  const { applyMeasuredLedger } = require("../networkProbe");
  const report = { technical_ledger: { domain_registration: {}, evidence_receipts: [] } };
  applyMeasuredLedger(report, {
    measured: true, domain: "hik-connect.com", apex_domain: "hik-connect.com", tls_certificate_status: "unreachable",
    registrar: "Amazon Registrar, Inc", registration_dates: { registered: "2015-12-18", updated: "2025-11-13", expires: "2026-12-18" },
    registrant: null, ip_addresses: [],
  });
  const reg = report.technical_ledger.domain_registration;
  assert.strictEqual(reg.registrar, "Amazon Registrar, Inc");
  assert.strictEqual(reg.registered_on, "2015-12-18");
  const rows = report.technical_ledger.evidence_receipts.map((r) => r.field);
  assert.ok(rows.includes("domain_registration.registrar") && rows.includes("domain_registration.registered_on"));
  assert.ok(!rows.includes("infrastructure.ip_addresses"), "no IP row when none was measured");
  console.log("probeFallbackTest: www. + registry-only passed");
}

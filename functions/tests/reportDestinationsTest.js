/**
 * Report button routing (fire 2026-10-16): each violation type gets its
 * reporting doors; fixed official URLs only. Run: node tests/reportDestinationsTest.js
 */
const assert = require("assert");
const { DOORS, MAX_DOORS, reportDestinations, applyReportDestinations } = require("../reportDestinations");
const { buildReportDoorsSummary, formatReportDoorsSummary } = require("../reportDoorsReport");

const report = ({ channel = "", type = "", badges = [], raisers = {}, surface = "", name = "" } = {}) => ({
  solicitation_identity: { channel, canonical_name: name },
  solicitation_pattern: { solicitation_type: type },
  consumer_card: {
    interface_surface: surface,
    classification_badges: badges,
    floor_raisers: Object.fromEntries(Object.keys(raisers).map((k) => [k, true])),
    floor_raiser_evidence: raisers,
  },
});
const ids = (r) => reportDestinations(r).map((d) => d.id);

// Impersonation / fraud → FTC + state AG (fire's example).
assert.deepStrictEqual(ids(report({ type: "fake invoice", raisers: { brand_impersonation: ["copies a bank's letterhead"] } })).slice(0, 2), ["ftc", "state_ag"]);
// UAC: print + telemarketing + impersonation alerts.
assert.deepStrictEqual(ids(report({ channel: "print", type: "Print Promotional Card & Telemarketing Funnel", raisers: { brand_impersonation: ["chambers say false"] } })),
  ["ftc", "state_ag", "fcc", "donotcall", "uspis"]);
// Phishing → Safe Browsing + CISA.
assert.ok(ids(report({ channel: "email", type: "phishing", raisers: { credential_harvesting: ["fake login"] } })).includes("safe_browsing_phish"));
// Government impersonation → the agency's watchdog + FBI.
const irs = ids(report({ channel: "phone", type: "IRS back-taxes robocall", raisers: { federal_impersonation: ["claims to be the IRS"] } }));
assert.deepStrictEqual(irs.slice(0, 3), ["ftc", "tigta", "ic3"]);
assert.ok(ids(report({ type: "Social Security suspension call", raisers: { federal_impersonation: ["SSA"] } })).includes("ssa_oig"));
// Crypto → SEC + CFTC + state securities.
assert.deepStrictEqual(ids(report({ type: "crypto token presale" })), ["ftc", "sec", "cftc", "state_securities"]);
// Extortion → FBI.
assert.ok(ids(report({ type: "sextortion email", raisers: { extortion_mechanics: ["pay or we leak"] } })).includes("ic3"));
// Malware, Play apps.
assert.ok(ids(report({ type: "malicious app download" })).includes("safe_browsing_malware"));
assert.ok(ids(report({ surface: "play.google.com/store/apps/details?id=x" })).includes("google_play"));
// A claimed raiser with no evidence is not acted on.
assert.ok(!ids(report({ raisers: { federal_impersonation: [] } })).includes("ic3"));
// Never more than MAX_DOORS; FTC always first; only vetted official URLs.
const many = reportDestinations(report({ channel: "phone", type: "crypto phishing robocall IRS", raisers: { federal_impersonation: ["IRS"], credential_harvesting: ["login"] } }));
assert.ok(many.length <= MAX_DOORS && many[0].id === "ftc");
for (const d of Object.values(DOORS)) {
  assert.match(d.url, /^https:\/\/(www\.)?(reportfraud\.ftc\.gov|naag\.org|ic3\.gov|safebrowsing\.google\.com|cisa\.gov|sec\.gov|cftc\.gov|nasaa\.org|consumercomplaints\.fcc\.gov|donotcall\.gov|uspis\.gov|support\.google\.com|tigta\.gov|oig\.ssa\.gov)\//, d.url);
  assert.ok(d.label && d.why.endsWith("."), d.label);
}
// Attached to the delivered card.
{
  const r = report({ type: "phishing" });
  assert.deepStrictEqual(applyReportDestinations(r), ["ftc", "safe_browsing_phish", "cisa"]);
  assert.strictEqual(r.consumer_card.report_destinations[0].url, "https://reportfraud.ftc.gov/");
}
// Report command.
{
  const s = buildReportDoorsSummary([
    { kind: "scan", requestId: "a", target: "UAC", score: 9, reportDoors: ["ftc", "state_ag", "uspis"] },
    { kind: "scan", requestId: "b", target: "Odd", score: 8.7, reportDoors: ["ftc"] },
    { kind: "scan", requestId: "c", target: "Navy", score: 1.8, reportDoors: ["ftc"] },
  ]);
  assert.strictEqual(s.reportable, 2);
  const text = formatReportDoorsSummary(s, "t");
  assert.ok(text.includes("FTC ONLY: 1"));
  assert.ok(text.includes("b  Odd (8.7)"));
}
console.log("reportDestinationsTest: all passed");

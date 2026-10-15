/**
 * Download links never reach a report, and the Cache Bank only resells
 * reports made under the current standard.
 * Run: node tests/downloadGuardAndStandardTest.js
 */
const assert = require("assert");
const { isFileDownloadUrl, stripDownloadLinks } = require("../downloadLinkGuard");
const { meetsReportStandard, REPORT_STANDARD } = require("../groundingVerification");

// The exact 10/14 link and today's bookmark.
assert.ok(isFileDownloadUrl("https://storage.googleapis.com/scanner-4ea67-apks/main-b2822dc-debug-20261014.apk"));
assert.ok(isFileDownloadUrl("https://storage.googleapis.com/scanner-4ea67-apks/latest-debug.apk"));
assert.ok(isFileDownloadUrl("https://scanner-4ea67-apks.storage.googleapis.com/x"));
assert.ok(isFileDownloadUrl("https://evil.example/drainer.APK?x=1"));
assert.ok(!isFileDownloadUrl("https://www.ftc.gov/news/acme"));
assert.ok(!isFileDownloadUrl("http://forum.example.org/thread/9"));
assert.ok(!isFileDownloadUrl("not a url"));

const report = {
  technical_ledger: {
    evidence_receipts: [
      { field: "a", finding: "kept", source_url: "https://storage.googleapis.com/scanner-4ea67-apks/latest-debug.apk", source_title: "apk" },
      { field: "b", finding: "kept", source_url: "https://www.bbb.org/x", source_title: "BBB" },
    ],
    network_telemetry: { grounding_sources: ["https://x.example/a.apk", "https://ok.example/"] },
  },
  alternatives: {
    discovery_items: [
      { name: "Bad", destination_url: "https://x.example/setup.exe" },
      { name: "Good", destination_url: "https://play.google.com/store/apps/details?id=x" },
    ],
  },
};
stripDownloadLinks(report);
const [r0, r1] = report.technical_ledger.evidence_receipts;
assert.equal(r0.source_url, "");
assert.equal(r0.finding, "kept", "finding survives");
assert.equal(r1.source_url, "https://www.bbb.org/x");
assert.deepEqual(report.technical_ledger.network_telemetry.grounding_sources, ["https://ok.example/"]);
assert.deepEqual(report.alternatives.discovery_items.map((i) => i.name), ["Good"]);
assert.doesNotThrow(() => stripDownloadLinks({}));

// Reports cached before the current standard are re-researched, not resold.
assert.equal(meetsReportStandard(null), false);
assert.equal(meetsReportStandard({ groundingVerification: { verified: true } }), false);
assert.equal(meetsReportStandard({ reportStandard: REPORT_STANDARD - 1 }), false);
assert.equal(meetsReportStandard({ reportStandard: REPORT_STANDARD }), true);

console.log("downloadGuardAndStandardTest: all passed");

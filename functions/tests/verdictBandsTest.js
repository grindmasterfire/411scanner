/**
 * Verdict bands (2026-10-16): a band runs up to the next band's min, so a
 * two-decimal manual score (UAC 8.49) gets its own band, not the fallback
 * "DELETE FROM EARTH". One-decimal scores are unchanged.
 * Run: node tests/verdictBandsTest.js
 */
const assert = require("assert");
const { getVerdict } = require("../actionMeter");

const cases = [
  [0, "EVERYBODY"], [2.9, "EVERYBODY"], [3.0, "MOSTLY EVERYBODY"],
  [5.5, "TRIBE"], [5.6, "TRIBE + KNOWLEDGE"], [7.9, "PROFESSIONAL CONSIDERATION ONLY"],
  [8.0, "DELETE FROM DEVICE"], [8.4, "DELETE FROM DEVICE"],
  [8.5, "DELETE FROM DEVICE AND REPORT"], [9.0, "REPORT TO PLATFORM"],
  [10.0, "DELETE FROM EARTH"], [11.5, "DELETE FROM EARTH"],
  // Gaps between one-decimal bands:
  [8.49, "DELETE FROM DEVICE"], [7.95, "PROFESSIONAL CONSIDERATION ONLY"],
  [2.95, "EVERYBODY"], [9.99, "REPORT TO PLATFORM"],
];
for (const [score, label] of cases) {
  assert.strictEqual(getVerdict(score).label, label, `${score} → ${label}`);
}
assert.strictEqual(getVerdict(8.49).badge, "DELETE_FROM_DEVICE");

console.log(`verdictBandsTest: ${cases.length}/${cases.length} passed`);

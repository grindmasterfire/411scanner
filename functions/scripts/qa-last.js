/**
 * @file: functions/scripts/qa-last.js
 * @class: Class 2
 * @cap: 150 Lines
 * @responsibility: Read recent 411 Scanner cache records for terminal calibration QA.
 * @dependencies: firebase-admin
 * @security_gate: Read-only utility. Never modifies records or invokes Gemini.
 * @owner_context: 411 Scanner calibration and token-cost observability.
 */

const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const limit = Math.max(1, Number(process.argv[2]) || 10);

function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function printScan(doc) {
  const data = doc.data() || {};
  const report = data.report || {};
  const card = report.consumer_card || {};
  const metrics = card.metrics || {};
  const telemetry = data.telemetry || {};

  console.log("");
  console.log("========================================");
  console.log(`Timestamp: ${data.timestamp || "unknown"}`);
  console.log(`Target: ${card.target_name || "unknown"}`);
  console.log(`Action Meter: ${card.action_meter_score ?? "unknown"}`);
  console.log(`Verdict: ${card.verdict_label || "unknown"}`);
  console.log("----------------------------------------");
  console.log(`Financial Risk: ${metrics.financial_risk ?? "?"}`);
  console.log(`Personal Data Exposure: ${metrics.personal_data_exposure ?? "?"}`);
  console.log(`Wasted Time & Ads: ${metrics.wasted_time_and_ads ?? "?"}`);
  console.log(`Real Substance: ${metrics.real_substance ?? "?"}`);
  console.log(`Offline Independence: ${metrics.offline_independence ?? "?"}`);
  console.log(`Honest Pricing: ${metrics.honest_pricing ?? "?"}`);
  console.log("----------------------------------------");
  console.log(`Model: ${telemetry.model || "unknown"}`);
  console.log(`Operation: ${telemetry.operation || "unknown"}`);
  console.log(`Prompt Tokens: ${formatNumber(telemetry.promptTokenCount)}`);
  console.log(`Output Tokens: ${formatNumber(telemetry.candidatesTokenCount)}`);
  console.log(`Total Tokens: ${formatNumber(telemetry.totalTokenCount)}`);
  console.log(`Cached Tokens: ${formatNumber(telemetry.cachedContentTokenCount)}`);
  console.log(`Thought Tokens: ${formatNumber(telemetry.thoughtsTokenCount)}`);
  console.log(`Finish Reason: ${telemetry.finishReason || "unknown"}`);
  console.log(`Cache Key: ${data.cacheKey || doc.id}`);
  console.log("========================================");
}

async function main() {
  const snapshot = await db
    .collection("scan_cache")
    .orderBy("timestamp", "desc")
    .limit(limit)
    .get();

  if (snapshot.empty) {
    console.log("411 QA: scan_cache is empty.");
    return;
  }

  console.log(`411 QA: showing ${snapshot.size} most recent scan(s).`);

  snapshot.forEach(printScan);
}

main().catch((error) => {
  console.error("411 QA reader failed:", error.message);
  process.exitCode = 1;
});
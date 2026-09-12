/**
 * @file: functions/scripts/qa-tokens.js
 * @class: Class 2
 * @cap: 150 Lines
 * @responsibility: Analyze observed Gemini token consumption for 411 Scanner cost and capacity QA.
 * @dependencies: child_process, https
 * @security_gate: Read-only utility. Never modifies records or invokes Gemini.
 * @owner_context: 411 Scanner token economics, capacity planning, and abuse-cost QA.
 */

const { execFileSync } = require("child_process");
const https = require("https");

const PROJECT_ID = "scanner-4ea67";
const DAILY_SCENARIOS = [1, 35, 100];
const DAYS_PER_MONTH = 30;

function getFirebaseToken() {
  const output = execFileSync(
    "firebase",
    ["login:ci", "--no-localhost"],
    { encoding: "utf8" }
  );

  const match = output.match(/1\/\/[A-Za-z0-9._-]+/);

  if (!match) {
    throw new Error("Firebase CLI did not provide an authentication token.");
  }

  return match[0];
}

function firestoreRequest(token, body) {
  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        hostname: "firestore.googleapis.com",
        path:
          `/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`,
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      },
      response => {
        let data = "";

        response.on("data", chunk => {
          data += chunk;
        });

        response.on("end", () => {
          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(
              new Error(
                `Firestore request failed (${response.statusCode}): ${data}`
              )
            );
            return;
          }

          resolve(JSON.parse(data));
        });
      }
    );

    request.on("error", reject);
    request.write(JSON.stringify(body));
    request.end();
  });
}

function number(value) {
  return Number(value || 0);
}

function formatNumber(value) {
  return Math.round(number(value)).toLocaleString("en-US");
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return 0;

  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) return sorted[lower];

  return sorted[lower] +
    (sorted[upper] - sorted[lower]) * (index - lower);
}

function summarize(values) {
  return {
    min: Math.min(...values),
    median: percentile(values, 0.5),
    p75: percentile(values, 0.75),
    p95: percentile(values, 0.95),
    max: Math.max(...values)
  };
}

function printMetric(label, values) {
  const summary = summarize(values);

  console.log("");
  console.log(label);
  console.log(`  Min:    ${formatNumber(summary.min)}`);
  console.log(`  Median: ${formatNumber(summary.median)}`);
  console.log(`  P75:    ${formatNumber(summary.p75)}`);
  console.log(`  P95:    ${formatNumber(summary.p95)}`);
  console.log(`  Max:    ${formatNumber(summary.max)}`);
}

function printProjection(label, value) {
  console.log("");
  console.log(label);

  for (const scansPerDay of DAILY_SCENARIOS) {
    const daily = value * scansPerDay;
    const monthly = daily * DAYS_PER_MONTH;

    console.log(
      `  ${scansPerDay} scan/day: ${formatNumber(daily)} / day | ${formatNumber(monthly)} / 30 days`
    );
  }
}

async function main() {
  const token = getFirebaseToken();

  // Query only scan_cache records that contain Gemini telemetry.
  const rows = await firestoreRequest(token, {
    structuredQuery: {
      from: [{ collectionId: "scan_cache" }],
      orderBy: [
        {
          field: {
            fieldPath: "timestamp"
          },
          direction: "DESCENDING"
        }
      ]
    }
  });

  const records = [];
  let missingTelemetry = 0;
  let abnormalFinishReasons = 0;

  for (const row of rows) {
    const fields = row.document?.fields || {};
    const telemetry = fields.telemetry?.mapValue?.fields;

    if (!telemetry) {
      missingTelemetry++;
      continue;
    }

    const value = name => telemetry[name]?.integerValue || 0;
    const finishReason = telemetry.finishReason?.stringValue || "";

    if (finishReason && finishReason !== "STOP") {
      abnormalFinishReasons++;
    }

    records.push({
      prompt: number(value("promptTokenCount")),
      output: number(value("candidatesTokenCount")),
      thoughts: number(value("thoughtsTokenCount")),
      cached: number(value("cachedContentTokenCount")),
      total: number(value("totalTokenCount"))
    });
  }

  if (!records.length) {
    console.log("411 Token QA: no usable Gemini telemetry found.");
    return;
  }

  const prompt = records.map(r => r.prompt);
  const output = records.map(r => r.output);
  const thoughts = records.map(r => r.thoughts);
  const cached = records.map(r => r.cached);
  const total = records.map(r => r.total);

  console.log("");
  console.log("========================================");
  console.log("411 SCANNER TOKEN ECONOMICS QA");
  console.log("========================================");
  console.log(`Firebase Project: ${PROJECT_ID}`);
  console.log(`Records returned: ${rows.length}`);
  console.log(`Usable telemetry: ${records.length}`);
  console.log(`Missing telemetry: ${missingTelemetry}`);
  console.log(`Non-STOP finish reasons: ${abnormalFinishReasons}`);
  console.log("----------------------------------------");

  printMetric("Prompt Tokens", prompt);
  printMetric("Output Tokens", output);
  printMetric("Thought Tokens", thoughts);
  printMetric("Cached Content Tokens", cached);
  printMetric("Total Tokens", total);

  const totalSummary = summarize(total);

  console.log("");
  console.log("----------------------------------------");
  console.log("TOTAL TOKEN PROJECTIONS");
  console.log("----------------------------------------");

  printProjection("Median workload", totalSummary.median);
  printProjection("P95 workload", totalSummary.p95);
  printProjection("Worst observed workload", totalSummary.max);

  console.log("");
  console.log("========================================");
}

main().catch(error => {
  console.error("411 Token QA failed:", error.message);
  process.exitCode = 1;
});
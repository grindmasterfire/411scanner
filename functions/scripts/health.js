/**
 * health.js — Operator field-health report (Class 3, standalone).
 */
const admin = require("firebase-admin");
const { buildBusinessSummary } = require("../businessCenterReport");

if (!admin.apps.length) {
  admin.initializeApp();
}

function weekStartUtc() {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = d.getUTCDay();
  const back = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - back);
  return d;
}

async function main() {
  const db = admin.firestore();
  const start = weekStartUtc();
  const snap = await db
    .collection("scan_receipts")
    .where("createdAt", ">=", start)
    .get();

  const receipts = [];
  snap.forEach((doc) => receipts.push(doc.data()));

  const summary = buildBusinessSummary(receipts);
  const total = summary.requestCount || 0;
  const rejected = summary.groundingRejectedRequests || 0;
  const rate = total > 0 ? (rejected / total) * 100 : 0;

  let verdict = "HEALTHY";
  let advice = "Grounding is landing. No action.";
  if (rate >= 10) {
    verdict = "DEGRADED";
    advice = "Grounding is missing often. Raise MAX_GROUNDING_RETRIES in .env and redeploy, or check Gemini quota.";
  } else if (rate >= 2) {
    verdict = "WATCH";
    advice = "Intermittent blink. Watch the trend before touching the dial.";
  }

  const lines = [];
  lines.push("=== 411 FIELD HEALTH (current UTC week) ===");
  lines.push("Week start (UTC): " + start.toISOString());
  lines.push("Total requests:   " + total);
  lines.push("Grounding rejected: " + rejected);
  lines.push("Reject rate:      " + rate.toFixed(1) + "%");
  lines.push("Verdict:          " + verdict);
  lines.push("Advice:           " + advice);

  const causes = summary.rejectCauses || {};
  lines.push("");
  lines.push("--- CAUSE BREAKDOWN ---");
  lines.push("Blink (retry helps):   " + (causes.blink || 0));
  lines.push("Model refused:         " + (causes.model_refused || 0));
  lines.push("Unknown:               " + (causes.unknown || 0));
  if (rejected > 0) {
    const bl = causes.blink || 0;
    const rf = causes.model_refused || 0;
    const un = causes.unknown || 0;
    if (bl >= rf && bl >= un) {
      lines.push("Cause advice: blink-dominant -> raising the retry dial should help.");
    } else if (rf > bl && rf >= un) {
      lines.push("Cause advice: refusal-dominant -> prompt/model issue, the dial will NOT help.");
    } else {
      lines.push("Cause advice: mostly unknown -> fills in as new scans run.");
    }
  }
  console.log(lines.join("\n"));
}

main().catch((e) => {
  console.error("health report failed:", e.message);
  process.exit(1);
});

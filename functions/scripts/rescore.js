/**
 * @file functions/scripts/rescore.js
 * @responsibility Live scoring check: run a specimen through the CURRENT
 *   local scan engine (prompt.js, actionMeter, floor raisers) and print how
 *   the score was built: the model's candidate, the 8.0 boundary, each
 *   validated floor raiser with its evidence, and the final score.
 * @security_gate Operator tool. Calls Gemini (costs a scan's worth of API),
 *   reads the specimen from the Incident Ledger, writes nothing anywhere.
 *   The Gemini key comes from the scan service env and is never printed.
 *
 * Usage (from functions/):
 *   node scripts/rescore.js <requestId> [--runs N]   a stored scan's specimen
 *   node scripts/rescore.js --image <file> [--runs N] any image file
 *
 * Differences from production: no Cache Bank history and no link/network
 * probe (they don't touch floor raisers or the boundary).
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const PROJECT = "scanner-4ea67";
const FIRESTORE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

function gcloud(cmd) {
  return execSync(`gcloud ${cmd}`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

function geminiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const svc = JSON.parse(gcloud(`run services describe scan --region us-central1 --project ${PROJECT} --format=json`));
  const env = svc.spec.template.spec.containers.flatMap((c) => c.env || []);
  return (env.find((e) => e.name === "GEMINI_API_KEY") || {}).value;
}

async function specimenFor(requestId) {
  const token = gcloud("auth print-access-token").trim();
  const res = await fetch(`${FIRESTORE}/incidents/${encodeURIComponent(requestId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`incident ${requestId} not found (${res.status})`);
  const spec = (await res.json()).fields?.specimen?.mapValue?.fields;
  const uri = spec?.uri?.stringValue;
  if (!uri) throw new Error(`incident ${requestId} has no stored specimen`);
  const bytes = execSync(`gcloud storage cat ${uri}`, { stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 });
  return { base64: bytes.toString("base64"), mimeType: spec.mimeType?.stringValue || "image/jpeg" };
}

function imageFile(file) {
  const ext = path.extname(file).toLowerCase();
  const mimeType = { ".png": "image/png", ".webp": "image/webp" }[ext] || "image/jpeg";
  return { base64: fs.readFileSync(file).toString("base64"), mimeType };
}

/** The model's own candidate, before the server governs it (last JSON call in the trace). */
function modelCandidate(trace = []) {
  for (const call of [...trace].reverse()) {
    const text = call.responseText || "";
    if (!text.includes("action_meter_score")) continue;
    try {
      const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
      return json?.consumer_card?.action_meter_score ?? null;
    } catch (e) { /* keep looking */ }
  }
  return null;
}

function explain(report, trace) {
  const { extractFloorRaisers } = require("../actionMeterFloorRaisers");
  const card = report.consumer_card || {};
  const context = card.action_meter_context || {};
  const raisers = extractFloorRaisers(report);
  const evidence = card.floor_raiser_evidence || {};
  const fired = Object.entries(card.floor_raisers || {}).filter(([, v]) => v === true).map(([k]) => k);
  const lines = [
    `Target: ${card.target_name || "?"}`,
    `Model candidate: ${modelCandidate(trace) ?? "?"}`,
    `8.0 boundary: ${context.consumer_disengagement_boundary === true ? "claimed" : "no"}${(context.evidence?.consumer_disengagement_boundary || []).length ? ` — ${context.evidence.consumer_disengagement_boundary.join(" ")}` : ""}`,
    `Floor raisers claimed: ${fired.length ? fired.join(", ") : "none"}`,
  ];
  for (const name of fired) {
    const camel = name.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    lines.push(`  ${name} ${raisers[camel] ? "VALIDATED" : "rejected (no evidence)"}: ${(evidence[name] || []).join(" ") || "-"}`);
  }
  lines.push(`FINAL: ${card.action_meter_score} ${card.verdict_label || ""}`);
  return lines.join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  const runsAt = args.indexOf("--runs");
  const runs = runsAt >= 0 ? Math.max(1, Number(args[runsAt + 1]) || 1) : 1;
  const imageAt = args.indexOf("--image");
  const specimen = imageAt >= 0 ? imageFile(args[imageAt + 1]) : args[0] && !args[0].startsWith("--") ? await specimenFor(args[0]) : null;
  if (!specimen) {
    console.error("Usage: node scripts/rescore.js <requestId> | --image <file> [--runs N]");
    process.exit(1);
  }
  const apiKey = geminiKey();
  if (!apiKey) throw new Error("No Gemini key (set GEMINI_API_KEY or sign in to gcloud).");

  const { analyzeImageWithGemini } = require("../geminiEngine");
  for (let run = 1; run <= runs; run++) {
    const { report, trace } = await analyzeImageWithGemini(apiKey, specimen.base64, specimen.mimeType, "");
    console.log(`\n=== Run ${run}/${runs} ===\n${explain(report, trace)}`);
  }
}

main().catch((e) => {
  console.error(`rescore failed: ${e.message}`);
  process.exit(1);
});

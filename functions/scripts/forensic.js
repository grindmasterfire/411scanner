/**
 * 411 Scanner Forensic Debugger
 *
 * Decode error codes and pull full Technical 411 reports from the backend.
 *
 * Usage:
 *   node scripts/forensic.js decode <code>      - Explain an error code
 *   node scripts/forensic.js report <requestId> - Pull full report for a scan
 *   node scripts/forensic.js last               - Pull most recent scan report
 *   node scripts/forensic.js receipts <requestId> - Show evidence receipts only
 *
 * Data sources (read-only):
 *   scan_receipts  -> request metadata, cost, cacheKey
 *   scan_cache     -> full report including technical_ledger
 */

const admin = require("firebase-admin");
const { decodeError } = require("./forensic-error-codes");

admin.initializeApp({ projectId: "scanner-4ea67" });
const db = admin.firestore();

async function cmdDecode(code) {
  const result = decodeError(code);
  console.log(`\n=== Error ${result.code}: ${result.title} ===`);
  console.log(`Component: ${result.component || "N/A"}`);
  console.log(`\nMeaning:\n  ${result.meaning}`);
  if (result.causes) {
    console.log(`\nCommon causes:`);
    result.causes.forEach((c) => console.log(`  - ${c}`));
  }
  if (result.fix) console.log(`\nFix:\n  ${result.fix}`);
  if (result.suggestion) console.log(`\n${result.suggestion}`);
  console.log("");
}

async function getReceipt(requestId) {
  const doc = await db.collection("scan_receipts").doc(requestId).get();
  if (!doc.exists) {
    console.log(`Receipt not found: ${requestId}`);
    return null;
  }
  return { id: doc.id, ...doc.data() };
}

async function getReportByCacheKey(cacheKey) {
  const doc = await db.collection("scan_cache").doc(cacheKey).get();
  if (!doc.exists) {
    console.log(`Cached report not found for key: ${cacheKey}`);
    return null;
  }
  return doc.data();
}

async function cmdReport(requestId) {
  const receipt = await getReceipt(requestId);
  if (!receipt) return;

  console.log(`\n=== Receipt: ${receipt.id} ===`);
  console.log(`Target: ${receipt.target || "?"}`);
  console.log(`Mode: ${receipt.mode || "?"}`);
  console.log(`Timestamp: ${receipt.createdAt?.toDate?.()?.toISOString?.() || "?"}`);
  console.log(`Cost: $${receipt.totalCost ?? "?"}`);
  console.log(`Cache key: ${receipt.cacheKey || "(none)"}`);

  if (!receipt.cacheKey) {
    console.log("\nNo cache key — cannot retrieve full report.");
    return;
  }

  const cached = await getReportByCacheKey(receipt.cacheKey);
  if (!cached) return;

  const report = cached.report || {};
  const ledger = report.technical_ledger || {};
  const receipts = ledger.evidence_receipts || [];

  console.log(`\n=== Full Technical 411 (${receipts.length} receipts) ===`);
  console.log(`Entity: ${report.consumer_card?.entity_name || "?"}`);
  console.log(`Score: ${report.consumer_card?.action_meter_score ?? "?"}`);
  console.log("");
  receipts.forEach((r, i) => {
    console.log(`${i + 1}. [${(r.status || "?").toUpperCase()}] ${r.field || "?"}`);
    console.log(`   Finding: ${(r.finding || "-").slice(0, 120)}`);
    console.log(`   Source: ${r.source_url || "(none)"}`);
  });
  console.log("");
}

async function cmdLast() {
  const snap = await db
    .collection("scan_receipts")
    .orderBy("createdAt", "desc")
    .limit(1)
    .get();
  if (snap.empty) {
    console.log("No receipts found.");
    return;
  }
  await cmdReport(snap.docs[0].id);
}

async function cmdReceipts(requestId) {
  const receipt = await getReceipt(requestId);
  if (!receipt || !receipt.cacheKey) return;
  const cached = await getReportByCacheKey(receipt.cacheKey);
  if (!cached) return;
  const receipts = cached.report?.technical_ledger?.evidence_receipts || [];
  console.log(`\n${receipts.length} evidence receipts for ${requestId}:\n`);
  receipts.forEach((r) => {
    console.log(`[${(r.status || "?").toUpperCase()}] ${r.field}: ${(r.finding || "").slice(0, 80)}`);
  });
  console.log("");
}

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  try {
    switch (cmd) {
      case "decode":
        if (!arg) return console.log("Usage: node scripts/forensic.js decode <code>");
        await cmdDecode(arg);
        break;
      case "report":
        if (!arg) return console.log("Usage: node scripts/forensic.js report <requestId>");
        await cmdReport(arg);
        break;
      case "receipts":
        if (!arg) return console.log("Usage: node scripts/forensic.js receipts <requestId>");
        await cmdReceipts(arg);
        break;
      case "last":
        await cmdLast();
        break;
      default:
        console.log("Usage:");
        console.log("  node scripts/forensic.js decode <code>");
        console.log("  node scripts/forensic.js report <requestId>");
        console.log("  node scripts/forensic.js receipts <requestId>");
        console.log("  node scripts/forensic.js last");
    }
  } catch (e) {
    console.error("ERROR:", e.message);
  }
  process.exit(0);
}

main();

/**
 * Dump a single scan report's Technical 411 evidence receipts.
 * Usage: node scripts/dump-receipts.js <requestId>
 */
const admin = require("firebase-admin");

const requestId = process.argv[2];
if (!requestId) {
  console.error("Usage: node scripts/dump-receipts.js <requestId>");
  process.exit(1);
}

admin.initializeApp({ projectId: "scanner-4ea67" });

admin
  .firestore()
  .collection("scan_results")
  .doc(requestId)
  .get()
  .then((doc) => {
    if (!doc.exists) {
      console.log("Not found:", requestId);
      process.exit(1);
    }
    const report = doc.data().report || {};
    const ledger = report.technical_ledger || {};
    const receipts = ledger.evidence_receipts || [];

    console.log(`=== ${requestId} ===`);
    console.log(
      `Entity: ${report.consumer_card?.entity_name || "?"} | Score: ${
        report.consumer_card?.action_meter_score ?? "?"
      }`
    );
    console.log(`Receipts: ${receipts.length}`);
    console.log("");
    receipts.forEach((r, i) => {
      console.log(
        `${i + 1}. [${(r.status || "?").toUpperCase()}] ${r.field || "?"}`
      );
      console.log(`   Authority: ${r.authority || "-"}`);
      console.log(`   Finding: ${(r.finding || "-").slice(0, 160)}`);
      console.log(`   Source: ${r.source_url || "(none)"}`);
      console.log("");
    });
    process.exit(0);
  })
  .catch((e) => {
    console.error("ERROR:", e.message);
    process.exit(1);
  });

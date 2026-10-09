/**
 * List recent scan results from Firestore.
 * Usage: node scripts/list-scans.js [limit]
 */
const admin = require("firebase-admin");

const limit = parseInt(process.argv[2] || "5", 10);

admin.initializeApp({ projectId: "scanner-4ea67" });

admin
  .firestore()
  .collection("scan_results")
  .orderBy("createdAt", "desc")
  .limit(limit)
  .get()
  .then((snap) => {
    if (snap.empty) {
      console.log("No scan results found.");
      process.exit(0);
    }
    snap.forEach((doc) => {
      const d = doc.data();
      const r = d.report || {};
      const entity =
        r.solicitation_identity?.destination_domain ||
        r.consumer_card?.entity_name ||
        "unknown";
      const score = r.consumer_card?.action_meter_score ?? "?";
      const created = d.createdAt?.toDate?.()?.toISOString?.() || "?";
      console.log(`${doc.id} | ${entity} | score:${score} | ${created}`);
    });
    process.exit(0);
  })
  .catch((e) => {
    console.error("ERROR:", e.message);
    process.exit(1);
  });

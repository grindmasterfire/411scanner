/**
 * List recent scans from Firestore with cache keys.
 * Usage: node scripts/list-scans.js [limit]
 *
 * Shows request ID, target, score, timestamp, and cache key for each scan.
 * Use the cache key with clear-cache.js to force a fresh scan.
 *
 * Local diagnostic only. Not deployed. Not reachable from app.
 */
const admin = require("firebase-admin");

const limit = parseInt(process.argv[2] || "10", 10);

admin.initializeApp({ projectId: "scanner-4ea67" });

admin
  .firestore()
  .collection("scan_receipts")
  .orderBy("createdAt", "desc")
  .limit(limit)
  .get()
  .then((snap) => {
    if (snap.empty) {
      console.log("No scans found.");
      process.exit(0);
    }
    console.log(`\nLast ${snap.size} scans:\n`);
    snap.forEach((doc) => {
      const d = doc.data();
      const target = (d.target || d.domain || "unknown").substring(0, 40);
      const score = d.score ?? "?";
      const created = d.createdAt?.toDate?.()?.toISOString?.().substring(0, 19) || "?";
      console.log(`${doc.id}`);
      console.log(`  Target: ${target} | Score: ${score} | ${created}`);
      if (d.cacheKey) {
        console.log(`  CacheKey: ${d.cacheKey}`);
      }
      console.log("");
    });
    process.exit(0);
  })
  .catch((e) => {
    console.error("ERROR:", e.message);
    process.exit(1);
  });

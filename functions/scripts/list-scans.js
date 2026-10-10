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
  .then(async (snap) => {
    if (snap.empty) {
      console.log("No scans found.");
      process.exit(0);
    }
    console.log(`\nLast ${snap.size} scans:\n`);
    for (const doc of snap.docs) {
      const d = doc.data();
      let target = "unknown";
      let score = "?";

      // Try to get target/score from cached report
      if (d.cacheKey) {
        try {
          const cacheDoc = await admin
            .firestore()
            .collection("scan_cache")
            .doc(d.cacheKey)
            .get();
          if (cacheDoc.exists) {
            const report = cacheDoc.data();
            // Try multiple possible locations for target/domain
            target =
              report.target ||
              report.domain ||
              report.solicitation_identity?.destination_domain ||
              report.consumer_card?.entity_name ||
              "unknown";
            score = report.score ?? report.consumer_card?.action_meter_score ?? "?";
            if (typeof target === "string") target = target.substring(0, 40);
          }
        } catch (e) {
          // Ignore cache read errors, use defaults
        }
      }

      const created = d.createdAt?.toDate?.()?.toISOString?.().substring(0, 19) || "?";
      console.log(`${doc.id}`);
      console.log(`  Target: ${target} | Score: ${score} | ${created}`);
      if (d.cacheKey) {
        console.log(`  CacheKey: ${d.cacheKey}`);
      }
      console.log("");
    }
    process.exit(0);
  })
  .catch((e) => {
    console.error("ERROR:", e.message);
    process.exit(1);
  });

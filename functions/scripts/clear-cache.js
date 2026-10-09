/**
 * Clear a specific cache entry to force a fresh scan.
 * Usage: node scripts/clear-cache.js <cacheKey>
 */
const admin = require("firebase-admin");

admin.initializeApp({ projectId: "scanner-4ea67" });

const cacheKey = process.argv[2];
if (!cacheKey) {
  console.error("Usage: node scripts/clear-cache.js <cacheKey>");
  process.exit(1);
}

admin
  .firestore()
  .collection("scan_cache")
  .doc(cacheKey)
  .delete()
  .then(() => {
    console.log(`Cleared cache entry: ${cacheKey}`);
    process.exit(0);
  })
  .catch((e) => {
    console.error("ERROR:", e.message);
    process.exit(1);
  });

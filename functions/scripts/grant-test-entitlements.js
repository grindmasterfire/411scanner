/**
 * Grant test entitlements to fire's tier-testing accounts.
 * Uses application-default credentials (works in Cloud Shell).
 * Usage: node scripts/grant-test-entitlements.js
 */

const admin = require("firebase-admin");
const { grantEntitlement } = require("../entitlementStore");

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || "scanner-4ea67";

if (!admin.apps.length) {
  admin.initializeApp({ projectId: PROJECT_ID });
}

const db = admin.firestore();

// fire's test matrix (2026-10-08)
const GRANTS = [
  { email: "lenardbrisco@gmail.com", tier: "pro", period: "monthly" },
  { email: "briscoleonard@gmail.com", tier: "family", period: "monthly" },
  { email: "iminethatcrypt1979@gmail.com", tier: "rental", period: "weekly" },
];

async function main() {
  for (const g of GRANTS) {
    try {
      const user = await admin.auth().getUserByEmail(g.email);
      await grantEntitlement(db, user.uid, g.tier, g.period);
      console.log(`GRANTED: ${g.email} -> ${g.tier}/${g.period}`);
    } catch (e) {
      console.log(`FAILED: ${g.email} — ${e.message}`);
    }
  }
  console.log("Done.");
}

main().catch((e) => {
  console.error("Fatal:", e.message);
  process.exit(1);
});

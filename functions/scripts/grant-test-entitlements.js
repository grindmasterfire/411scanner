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
// TESTING ONLY — remove these grants before production launch.
const GRANTS = [
  { email: "lenardbrisco@gmail.com", tier: "pro", period: "monthly", topUps: 20 },
  { email: "briscoleonard@gmail.com", tier: "family", period: "monthly", topUps: 25 },
  { email: "iminethatcrypt1979@gmail.com", tier: "rental", period: "weekly", topUps: 10 },
];

async function main() {
  for (const g of GRANTS) {
    try {
      const user = await admin.auth().getUserByEmail(g.email);
      await grantEntitlement(db, user.uid, g.tier, g.period);
      console.log(`GRANTED: ${g.email} -> ${g.tier}/${g.period}`);

      // Dummy top-ups for deep dive testing.
      if (g.topUps) {
        const ent = await db.collection("entitlements").doc(user.uid).get();
        const data = ent.exists ? ent.data() : {};
        let bucketRef;
        if (data.familyGroupId) {
          bucketRef = db.collection("familyGroups").doc(data.familyGroupId);
        } else {
          bucketRef = db.collection("entitlements").doc(user.uid);
        }
        await bucketRef.update({
          topUpScans: admin.firestore.FieldValue.increment(g.topUps),
        });
        console.log(`  +${g.topUps} top-ups`);
      }
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

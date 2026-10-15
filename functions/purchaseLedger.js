/**
 * @file functions/purchaseLedger.js
 * @class Class 1
 * @cap 100 lines
 * @responsibility Credit each Google Play order exactly once, to the account
 *   that bought it.
 * @dependencies firebase-admin/firestore (FieldValue)
 * @security_gate The app re-sends every active purchase on each launch
 *   (queryActivePurchases). Without this ledger, each re-send reset a
 *   subscription's used scans to 0 and re-credited top-ups. A subscription
 *   renewal is a new order ID, so it refills once per billing period.
 * @owner_context Storyboard 11.2 (2026-10-15).
 *
 * Doc shape at play_orders/{orderKey}:
 *   { orderKey, uid, productId, creditedAtMs, mode }
 * orderKey = the Play order ID when verified, else "token:<sha256>".
 */

const crypto = require("crypto");
const { FieldValue } = require("firebase-admin/firestore");

const COLLECTION = "play_orders";

function orderKeyFor({ orderId, purchaseToken }) {
  if (orderId) return String(orderId).replace(/\//g, "_");
  return `token:${crypto.createHash("sha256").update(String(purchaseToken || "")).digest("hex")}`;
}

/** The account fingerprint the app stamps on a purchase (obfuscatedAccountId). */
function accountFingerprint(uid) {
  return crypto.createHash("sha256").update(`411-account:${uid}`).digest("hex").slice(0, 64);
}

/**
 * Claim an order for uid. Returns { fresh: true } the first time;
 * { fresh: false, sameAccount } after that. Transactional, so two
 * simultaneous re-sends can't both credit.
 */
async function claimOrder(db, { orderKey, uid, productId, mode }) {
  const ref = db.collection(COLLECTION).doc(orderKey);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      return { fresh: false, sameAccount: snap.data().uid === uid };
    }
    tx.set(ref, {
      orderKey,
      uid,
      productId,
      mode: mode || null,
      creditedAtMs: Date.now(),
      creditedAt: FieldValue.serverTimestamp(),
    });
    return { fresh: true };
  });
}

module.exports = {
  orderKeyFor,
  accountFingerprint,
  claimOrder,
};

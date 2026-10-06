/**
 * @file functions/entitlementStore.js
 * @class Class 1
 * @cap 150 Lines
 * @responsibility Per-user scan entitlement: read, check-before-execute,
 *   consume-after, with lazy billing-anniversary reset.
 * @dependencies firebase-admin/firestore
 * @security_gate Enforcement only. Does not grant entitlement (billing writes
 *   the doc) and does not touch diagnosis, scoring, or Cache Bank.
 * @owner_context 411 Scanner paid scan-bucket enforcement (Loop B).
 *
 * Doc shape at entitlements/{uid}:
 *   { tier: "standard"|"pro", scansAllowed: 30|60, scansUsed: <int>,
 *     anniversaryEpochMs: <next reset, ms>, periodMs: <billing period length>,
 *     updatedAt: <serverTimestamp> }
 *
 * A guest (no uid) or a user with no doc is FREE tier: allowed through,
 * nothing consumed. The device free-tier counter still governs those.
 */

const { FieldValue } = require("firebase-admin/firestore");

const COLLECTION = "entitlements";

async function getEntitlement(db, uid) {
  if (!uid) return null;
  try {
    const snap = await db.collection(COLLECTION).doc(uid).get();
    return snap.exists ? snap.data() : null;
  } catch (e) {
    console.warn("[entitlement] read failed:", e.message);
    return null; // fail open to free tier — never block a scan on a read error
  }
}

/*
 * Lazy anniversary reset: if the billing period has rolled over, zero the
 * used count and advance the anniversary. Returns the effective used count.
 */
async function maybeReset(db, uid, ent) {
  const now = Date.now();
  const anniv = Number(ent.anniversaryEpochMs) || 0;
  const period = Number(ent.periodMs) || 0;
  if (anniv && period && now >= anniv) {
    let nextAnniv = anniv;
    while (now >= nextAnniv) nextAnniv += period; // handle multiple missed periods
    try {
      await db.collection(COLLECTION).doc(uid).update({
        scansUsed: 0,
        anniversaryEpochMs: nextAnniv,
        updatedAt: FieldValue.serverTimestamp(),
      });
    } catch (e) {
      console.warn("[entitlement] reset failed:", e.message);
    }
    return 0;
  }
  return Number(ent.scansUsed) || 0;
}

/*
 * Decide whether this caller may scan now. Free/guest always allowed.
 */
async function checkEntitlement(db, uid) {
  const ent = await getEntitlement(db, uid);
  if (!ent) return { allowed: true, tier: "free" };
  const used = await maybeReset(db, uid, ent);
  const allowed = used < (Number(ent.scansAllowed) || 0);
  return {
    allowed,
    tier: ent.tier || "paid",
    reason: allowed ? null : "quota_exhausted",
    scansAllowed: Number(ent.scansAllowed) || 0,
    scansUsed: used,
  };
}

/*
 * Count one delivered scan. Paid users only; guests are a no-op.
 * Cache hits DO consume (a scan is a scan to the user; costs us ~$0 = margin).
 */
async function consumeScan(db, uid) {
  if (!uid) return;
  try {
    const ref = db.collection(COLLECTION).doc(uid);
    const snap = await ref.get();
    if (!snap.exists) return; // free tier — nothing to consume
    await ref.update({
      scansUsed: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.warn("[entitlement] consume failed:", e.message);
  }
}

/*
 * Write/refresh a user's entitlement from a (verified) purchase.
 * tier: "standard"|"pro"; period: "weekly"|"monthly"|"annual".
 * Resets scansUsed to 0 and sets the next anniversary one period out.
 */
const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_MS = { weekly: 7*DAY_MS, monthly: 30*DAY_MS, annual: 365*DAY_MS };
const SCANS = { standard: 30, pro: 60 };

async function grantEntitlement(db, uid, tier, period) {
  if (!uid) throw new Error("grantEntitlement: uid required");
  const scansAllowed = SCANS[tier];
  const periodMs = PERIOD_MS[period];
  if (!scansAllowed || !periodMs) throw new Error(`grantEntitlement: bad tier/period ${tier}/${period}`);
  const doc = {
    tier, scansAllowed, scansUsed: 0,
    periodMs,
    anniversaryEpochMs: Date.now() + periodMs,
    updatedAt: FieldValue.serverTimestamp(),
  };
  await db.collection(COLLECTION).doc(uid).set(doc, { merge: true });
  return doc;
}

module.exports = { getEntitlement, checkEntitlement, consumeScan, grantEntitlement };

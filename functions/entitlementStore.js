/**
 * @file functions/entitlementStore.js
 * @class Class 1
 * @cap 380 Lines
 * @responsibility Per-user scan entitlement: read, check-before-execute,
 *   consume-after, with lazy billing-anniversary reset. Owns the full
 *   411 Scanner tier schedule (rental/standard/pro/family), subscriber
 *   top-up banks, and family shared buckets.
 * @dependencies firebase-admin/firestore
 * @security_gate Enforcement only. Does not grant entitlement (billing writes
 *   the doc) and does not touch diagnosis, scoring, or Cache Bank.
 * @owner_context 411 Scanner paid scan-bucket enforcement (Loop B).
 *
 * Tier schedule (final, 2026-10-06):
 *   rental:           $3.99 / 7 days,    7 scans
 *   standard monthly: $12.99 / 30 days, 30 scans
 *   standard annual:  $129.99 / 365 days, 360 scans
 *   pro monthly:      $24.99 / 30 days, 60 scans
 *   pro annual:       $249.99 / 365 days, 720 scans
 *   family monthly:   $19.99 / 30 days, 40 shared scans, 4 seats
 *   family annual:    $199.99 / 365 days, 480 shared scans, 4 seats
 *   top-ups (active subscribers only; carry over; never expire):
 *     5 scans / $2.99, 10 / $4.99, 20 / $8.99, family 25 / $10.99
 *
 * Hard bucket rule: every scan, fresh or cached, deducts one credit.
 * Subscription credits reset at the billing boundary and do not roll over.
 * Top-up credits are a separate bank: subscriber-only, carry over, never
 * expire. Subscription scans burn first (they expire); top-ups spend last.
 *
 * Doc shape at entitlements/{uid}:
 *   { tier: "rental"|"standard"|"pro"|"family",
 *     scansAllowed: <int>, scansUsed: <int>,
 *     topUpScans: <int>,               // never reset by anniversary
 *     familyGroupId: <string|null>,    // set for family members
 *     anniversaryEpochMs: <next reset, ms>, periodMs: <billing period length>,
 *     updatedAt: <serverTimestamp> }
 *
 * Doc shape at familyGroups/{groupId}:
 *   { scansAllowed: <int>, scansUsed: <int>, topUpScans: <int>,
 *     seats: [<uid>, ...], ownerUid: <uid>, // max 4 seats
 *     anniversaryEpochMs: <next reset, ms>, periodMs: <billing period length>,
 *     updatedAt: <serverTimestamp> }
 *
 * A guest (no uid) or a user with no doc is FREE tier: allowed through,
 * nothing consumed. The device free-tier counter still governs those
 * (one ad-gated scan per week, enforced client-side).
 */

const { FieldValue } = require("firebase-admin/firestore");

const COLLECTION = "entitlements";
const FAMILY_COLLECTION = "familyGroups";
const MAX_FAMILY_SEATS = 4;

const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_MS = { weekly: 7 * DAY_MS, monthly: 30 * DAY_MS, annual: 365 * DAY_MS };

/*
 * Grant table: tier -> period -> total scans for the billing period.
 * Every (tier, period) pair NOT listed here is rejected at grant time.
 */
const GRANTS = {
  rental:   { weekly: 7 },
  standard: { monthly: 30, annual: 360 },
  pro:      { monthly: 60, annual: 720 },
  family:   { monthly: 40, annual: 480 },
};

function grantFor(tier, period) {
  const byPeriod = GRANTS[tier];
  if (!byPeriod) return 0;
  return Number(byPeriod[period]) || 0;
}

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

async function getFamilyGroup(db, groupId) {
  if (!groupId) return null;
  try {
    const snap = await db.collection(FAMILY_COLLECTION).doc(groupId).get();
    return snap.exists ? snap.data() : null;
  } catch (e) {
    console.warn("[entitlement] family group read failed:", e.message);
    return null;
  }
}

/*
 * Resolve the bucket doc that actually holds this user's scans. Family
 * members point at the shared group doc; everyone else uses their own
 * entitlement doc. Returns { ref, data, isFamily } or null for free tier.
 */
async function resolveBucket(db, uid, ent) {
  if (!ent) return null;
  if (ent.familyGroupId) {
    const groupRef = db.collection(FAMILY_COLLECTION).doc(ent.familyGroupId);
    let group = null;
    try {
      const snap = await groupRef.get();
      group = snap.exists ? snap.data() : null;
    } catch (e) {
      console.warn("[entitlement] family group read failed:", e.message);
      return null; // fail open
    }
    if (!group) return null; // orphaned pointer — treat as free tier
    return { ref: groupRef, data: group, isFamily: true };
  }
  return { ref: db.collection(COLLECTION).doc(uid), data: ent, isFamily: false };
}

/*
 * Lazy anniversary reset: if the billing period has rolled over, zero the
 * used count and advance the anniversary. Top-up banks are NEVER reset.
 * Returns the effective used count.
 */
async function maybeResetBucket(db, ref, bucket) {
  const now = Date.now();
  const anniv = Number(bucket.anniversaryEpochMs) || 0;
  const period = Number(bucket.periodMs) || 0;
  if (anniv && period && now >= anniv) {
    let nextAnniv = anniv;
    while (now >= nextAnniv) nextAnniv += period; // handle multiple missed periods
    try {
      await ref.update({
        scansUsed: 0,
        anniversaryEpochMs: nextAnniv,
        updatedAt: FieldValue.serverTimestamp(),
      });
    } catch (e) {
      console.warn("[entitlement] reset failed:", e.message);
    }
    return 0;
  }
  return Number(bucket.scansUsed) || 0;
}

/*
 * Decide whether this caller may scan now. Free/guest always allowed.
 * Allowed when subscription scans remain OR top-up bank is non-empty.
 */
async function checkEntitlement(db, uid) {
  const ent = await getEntitlement(db, uid);
  if (!ent) return { allowed: true, tier: "free" };
  const bucket = await resolveBucket(db, uid, ent);
  if (!bucket) return { allowed: true, tier: "free" };
  const used = await maybeResetBucket(db, bucket.ref, bucket.data);
  const scansAllowed = Number(bucket.data.scansAllowed) || 0;
  const topUpScans = Number(bucket.data.topUpScans) || 0;
  const allowed = used < scansAllowed || topUpScans > 0;
  return {
    allowed,
    tier: ent.tier || "paid",
    reason: allowed ? null : "quota_exhausted",
    scansAllowed,
    scansUsed: used,
    topUpScans,
  };
}

/*
 * Count one delivered scan. Paid users only; guests are a no-op.
 * Cache hits DO consume (a scan is a scan to the user; costs us ~$0 = margin).
 * Subscription scans burn first (they expire); top-up bank spends last.
 */
async function consumeScan(db, uid) {
  if (!uid) return;
  try {
    const ent = await getEntitlement(db, uid);
    if (!ent) return; // free tier — nothing to consume
    const bucket = await resolveBucket(db, uid, ent);
    if (!bucket) return;
    const used = await maybeResetBucket(db, bucket.ref, bucket.data);
    const scansAllowed = Number(bucket.data.scansAllowed) || 0;
    const topUpScans = Number(bucket.data.topUpScans) || 0;
    if (used < scansAllowed) {
      await bucket.ref.update({
        scansUsed: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else if (topUpScans > 0) {
      await bucket.ref.update({
        topUpScans: FieldValue.increment(-1),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  } catch (e) {
    console.warn("[entitlement] consume failed:", e.message);
  }
}

/*
 * Write/refresh a user's entitlement from a (verified) purchase.
 * tier: "rental"|"standard"|"pro"|"family";
 * period: "weekly"|"monthly"|"annual" (must be a listed GRANTS pair).
 * Resets scansUsed to 0 and sets the next anniversary one period out.
 * Top-up banks are preserved: they carry over and never expire.
 * Family purchases create (or refresh) the shared family group; the
 * purchaser becomes owner and first seat.
 */
async function grantEntitlement(db, uid, tier, period) {
  if (!uid) throw new Error("grantEntitlement: uid required");
  const scansAllowed = grantFor(tier, period);
  const periodMs = PERIOD_MS[period];
  if (!scansAllowed || !periodMs) {
    throw new Error(`grantEntitlement: bad tier/period ${tier}/${period}`);
  }
  const now = Date.now();

  if (tier === "family") {
    const groupRef = db.collection(FAMILY_COLLECTION).doc();
    const groupDoc = {
      scansAllowed,
      scansUsed: 0,
      topUpScans: 0,
      seats: [uid],
      ownerUid: uid,
      periodMs,
      anniversaryEpochMs: now + periodMs,
      updatedAt: FieldValue.serverTimestamp(),
    };
    await groupRef.set(groupDoc);
    const userDoc = {
      tier,
      familyGroupId: groupRef.id,
      scansAllowed: 0,
      scansUsed: 0,
      topUpScans: 0,
      periodMs,
      anniversaryEpochMs: now + periodMs,
      updatedAt: FieldValue.serverTimestamp(),
    };
    await db.collection(COLLECTION).doc(uid).set(userDoc, { merge: true });
    return { ...userDoc, familyGroupId: groupRef.id };
  }

  const ref = db.collection(COLLECTION).doc(uid);
  const existing = await getEntitlement(db, uid);
  const doc = {
    tier,
    familyGroupId: null,
    scansAllowed,
    scansUsed: 0,
    // Preserve any banked top-ups across renewals: they never expire.
    topUpScans: existing ? Number(existing.topUpScans) || 0 : 0,
    periodMs,
    anniversaryEpochMs: now + periodMs,
    updatedAt: FieldValue.serverTimestamp(),
  };
  await ref.set(doc, { merge: true });
  return doc;
}

/*
 * Grant a top-up pack to an active subscriber. Subscriber-only: the caller
 * must hold an entitlement doc. Family members credit the shared group bank
 * (family top-up packs belong to the group); everyone else credits their
 * own bank. Top-ups carry over and never expire.
 */
async function grantTopUp(db, uid, scans) {
  if (!uid) throw new Error("grantTopUp: uid required");
  const pack = Number(scans);
  if (!Number.isInteger(pack) || pack <= 0) {
    throw new Error(`grantTopUp: bad pack size ${scans}`);
  }
  const ent = await getEntitlement(db, uid);
  if (!ent) throw new Error("grantTopUp: active subscription required");
  if (ent.familyGroupId) {
    const groupRef = db.collection(FAMILY_COLLECTION).doc(ent.familyGroupId);
    const snap = await groupRef.get();
    if (!snap.exists) throw new Error("grantTopUp: family group not found");
    await groupRef.update({
      topUpScans: FieldValue.increment(pack),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { familyGroupId: ent.familyGroupId, credited: pack };
  }
  await db.collection(COLLECTION).doc(uid).update({
    topUpScans: FieldValue.increment(pack),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { uid, credited: pack };
}

/*
 * Link another Google account as a seat on a family group. Owner-only,
 * max 4 seats. The new seat's entitlement doc becomes a pointer at the
 * shared group bucket (any prior individual bucket on that doc is
 * superseded, not merged).
 */
async function linkFamilySeat(db, groupId, ownerUid, seatUid) {
  if (!groupId || !ownerUid || !seatUid) {
    throw new Error("linkFamilySeat: groupId, ownerUid, and seatUid required");
  }
  const groupRef = db.collection(FAMILY_COLLECTION).doc(groupId);
  const snap = await groupRef.get();
  if (!snap.exists) throw new Error("linkFamilySeat: family group not found");
  const group = snap.data();
  if (group.ownerUid !== ownerUid) {
    throw new Error("linkFamilySeat: only the group owner can link seats");
  }
  const seats = Array.isArray(group.seats) ? group.seats : [];
  if (seats.includes(seatUid)) return { groupId, seatUid, alreadyLinked: true };
  if (seats.length >= MAX_FAMILY_SEATS) {
    throw new Error("linkFamilySeat: family group is full (4 seats)");
  }
  await groupRef.update({
    seats: FieldValue.arrayUnion(seatUid),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await db.collection(COLLECTION).doc(seatUid).set(
    {
      tier: "family",
      familyGroupId: groupId,
      scansAllowed: 0,
      scansUsed: 0,
      topUpScans: 0,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  return { groupId, seatUid, linked: true };
}

module.exports = {
  getEntitlement,
  getFamilyGroup,
  checkEntitlement,
  consumeScan,
  grantEntitlement,
  grantTopUp,
  linkFamilySeat,
  GRANTS,
  PERIOD_MS,
  MAX_FAMILY_SEATS,
};

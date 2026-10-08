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

// TESTING ONLY — remove before production launch.
// The sudo/tester account bypasses top-up requirements for deep dives.
const TESTER_EMAIL = "grindmasterfire@gmail.com";

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
 * Resolve the bucket doc inside a transaction. Returns { ref, data } or
 * null when there is no bucket (free tier / orphaned pointer).
 */
async function resolveBucketTx(tx, db, uid, ent) {
  if (!ent) return null;
  if (ent.familyGroupId) {
    const groupRef = db.collection(FAMILY_COLLECTION).doc(ent.familyGroupId);
    const snap = await tx.get(groupRef);
    if (!snap.exists) return null;
    return { ref: groupRef, data: snap.data() };
  }
  const ref = db.collection(COLLECTION).doc(uid);
  return { ref, data: ent };
}

/*
 * Count one delivered scan. Paid users only; guests are a no-op.
 * Cache hits DO consume (a scan is a scan to the user; costs us ~$0 = margin).
 * Subscription scans burn first (they expire); top-up bank spends last.
 *
 * Transactional: the balance check and the deduction happen atomically
 * inside a single Firestore transaction, so a burst of concurrent scans
 * cannot overdraft the bucket. checkEntitlement remains the advisory gate;
 * this is the authoritative deduction.
 * Returns { consumed: bool, via?: "subscription"|"topup", reason? }.
 */
async function consumeScan(db, uid) {
  if (!uid) return { consumed: false, reason: "no_uid" };
  try {
    return await db.runTransaction(async (tx) => {
      const entSnap = await tx.get(db.collection(COLLECTION).doc(uid));
      const ent = entSnap.exists ? entSnap.data() : null;
      const bucket = await resolveBucketTx(tx, db, uid, ent);
      if (!bucket) return { consumed: false, reason: "free" };

      // Family restriction: blocked members cannot burn credits.
      if (bucket.isFamily) {
        const restricted = Array.isArray(bucket.data.restrictedSeats)
          ? bucket.data.restrictedSeats
          : [];
        if (restricted.includes(uid)) {
          return { consumed: false, reason: "restricted" };
        }
      }

      const data = bucket.data || {};

      // Anniversary reset, applied atomically inside the transaction.
      const now = Date.now();
      const anniv = Number(data.anniversaryEpochMs) || 0;
      const period = Number(data.periodMs) || 0;
      let used = Number(data.scansUsed) || 0;
      let resetting = false;
      let nextAnniv = anniv;
      if (anniv && period && now >= anniv) {
        nextAnniv = anniv;
        while (now >= nextAnniv) nextAnniv += period; // multiple missed periods
        used = 0;
        resetting = true;
      }

      const allowed = Number(data.scansAllowed) || 0;
      const topUp = Number(data.topUpScans) || 0;
      const updates = { updatedAt: FieldValue.serverTimestamp() };
      let via = null;
      if (used < allowed) {
        // A plain set and an increment cannot share a field in one update:
        // after a reset, write the post-consume value directly.
        updates.scansUsed = resetting ? 1 : FieldValue.increment(1);
        via = "subscription";
      } else if (topUp > 0) {
        if (resetting) updates.scansUsed = 0;
        updates.topUpScans = FieldValue.increment(-1);
        via = "topup";
      } else {
        return { consumed: false, reason: "quota_exhausted" };
      }
      if (resetting) updates.anniversaryEpochMs = nextAnniv;
      tx.update(bucket.ref, updates);

      // Family per-member activity tracking: record who burned the credit.
      // Stored as memberActivity.{uid} = { scans, lastAt } on the group doc.
      if (bucket.isFamily) {
        const activityKey = `memberActivity.${uid}.scans`;
        const lastAtKey = `memberActivity.${uid}.lastAt`;
        tx.update(bucket.ref, {
          [activityKey]: FieldValue.increment(1),
          [lastAtKey]: FieldValue.serverTimestamp(),
        });
      }

      return { consumed: true, via };
    });
  } catch (e) {
    console.warn("[entitlement] consume failed:", e.message);
    return { consumed: false, reason: "error" };
  }
}

/*
 * Deep Dive gating: a deep dive spends exactly 1 top-up credit from the
 * topUpScans bank — subscription scan credits are NEVER touched. Family
 * members draw from the shared group bank (same resolveBucket path as
 * consumeScan). Returns whether a credit is available.
 */
async function checkDeepDiveEntitlement(db, uid) {
  // TESTING ONLY: sudo bypasses the top-up requirement.
  try {
    const user = await require("firebase-admin").auth().getUser(uid);
    if (user.email && user.email.toLowerCase() === TESTER_EMAIL) {
      return { allowed: true, topUpScans: 999999, isTester: true };
    }
  } catch (e) { /* fall through to normal check */ }

  const ent = await getEntitlement(db, uid);
  if (!ent) return { allowed: false, topUpScans: 0 };
  const bucket = await resolveBucket(db, uid, ent);
  if (!bucket) return { allowed: false, topUpScans: 0 };
  await maybeResetBucket(db, bucket.ref, bucket.data);
  const topUpScans = Number(bucket.data.topUpScans) || 0;
  return { allowed: topUpScans > 0, topUpScans };
}

/*
 * Deduct 1 top-up credit for a delivered deep dive. Transactional: the
 * empty-bank check and the deduction are atomic inside a single Firestore
 * transaction, so a burst of concurrent dives cannot drive the bank
 * negative. Subscription scan credits are NEVER touched.
 *
 * Returns { consumed: bool, reason? }. Callers MUST abort the dive when
 * consumed is false — the credit is committed before the AI work begins.
 */
async function consumeDeepDive(db, uid) {
  if (!uid) return { consumed: false, reason: "no_uid" };
  // TESTING ONLY: sudo never depletes the bank.
  try {
    const user = await require("firebase-admin").auth().getUser(uid);
    if (user.email && user.email.toLowerCase() === TESTER_EMAIL) {
      return { consumed: true, isTester: true };
    }
  } catch (e) { /* fall through to normal consume */ }
  try {
    return await db.runTransaction(async (tx) => {
      const entSnap = await tx.get(db.collection(COLLECTION).doc(uid));
      const ent = entSnap.exists ? entSnap.data() : null;
      const bucket = await resolveBucketTx(tx, db, uid, ent);
      if (!bucket) return { consumed: false, reason: "no_entitlement" };
      const topUp = Number((bucket.data || {}).topUpScans) || 0;
      if (topUp <= 0) return { consumed: false, reason: "empty_bank" };
      tx.update(bucket.ref, {
        topUpScans: FieldValue.increment(-1),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { consumed: true };
    });
  } catch (e) {
    console.warn("[entitlement] deep dive consume failed:", e.message);
    return { consumed: false, reason: "error" };
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
    // Renewal-safe: if the caller already owns a family group, refresh it
    // in place (fresh bucket, preserved seats and top-up bank) instead of
    // orphaning the old group and stranding linked seats on a stale bucket.
    const existing = await getEntitlement(db, uid);
    const existingGroupId = existing && existing.familyGroupId;
    let groupRef = null;
    let seats = [uid];
    let preservedTopUp = 0;
    if (existingGroupId) {
      try {
        const snap = await db.collection(FAMILY_COLLECTION).doc(existingGroupId).get();
        if (snap.exists && snap.data().ownerUid === uid) {
          groupRef = snap.ref;
          const g = snap.data();
          preservedTopUp = Number(g.topUpScans) || 0;
          const prevSeats = Array.isArray(g.seats) ? g.seats : [];
          seats = prevSeats.includes(uid) ? prevSeats : [uid, ...prevSeats].slice(0, MAX_FAMILY_SEATS);
        }
      } catch (e) {
        console.warn("[entitlement] family refresh read failed:", e.message);
      }
    }
    if (!groupRef) {
      // New family purchase (or the old group is gone): fresh group.
      groupRef = db.collection(FAMILY_COLLECTION).doc();
      // If the buyer was a seat on a different group, release that seat so
      // it doesn't linger as a stale entry consuming a slot.
      if (existingGroupId) {
        try {
          await db.collection(FAMILY_COLLECTION).doc(existingGroupId).update({
            seats: FieldValue.arrayRemove(uid),
            updatedAt: FieldValue.serverTimestamp(),
          });
        } catch (e) { /* old group may be gone; ignore */ }
      }
    }
    const groupDoc = {
      scansAllowed,
      scansUsed: 0,
      topUpScans: preservedTopUp,
      seats,
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
  // Atomic read-check-write inside a single transaction: the seat grant AND
  // the member's pointer doc commit together, so concurrent link calls can
  // neither exceed MAX_FAMILY_SEATS (TOCTOU) nor strand a seat without its
  // bucket pointer.
  const alreadyLinked = await db.runTransaction(async (tx) => {
    const snap = await tx.get(groupRef);
    if (!snap.exists) throw new Error("linkFamilySeat: family group not found");
    const group = snap.data();
    if (group.ownerUid !== ownerUid) {
      throw new Error("linkFamilySeat: only the group owner can link seats");
    }
    const seats = Array.isArray(group.seats) ? group.seats : [];
    const already = seats.includes(seatUid);
    if (!already) {
      if (seats.length >= MAX_FAMILY_SEATS) {
        throw new Error("linkFamilySeat: family group is full (4 seats)");
      }
      tx.update(groupRef, {
        seats: FieldValue.arrayUnion(seatUid),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    tx.set(
      db.collection(COLLECTION).doc(seatUid),
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
    return already;
  });
  if (alreadyLinked) return { groupId, seatUid, alreadyLinked: true };
  return { groupId, seatUid, linked: true };
}

/*
 * Remove a family member (kick). Only the owner can kick, and cannot
 * kick themselves. The member's entitlement pointer is deleted; their
 * activity history stays on the group doc.
 */
async function removeFamilySeat(db, groupId, ownerUid, seatUid) {
  if (!groupId || !ownerUid || !seatUid) {
    throw new Error("removeFamilySeat: groupId, ownerUid, and seatUid required");
  }
  if (seatUid === ownerUid) {
    throw new Error("removeFamilySeat: owner cannot remove themselves");
  }
  const groupRef = db.collection(FAMILY_COLLECTION).doc(groupId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(groupRef);
    if (!snap.exists) throw new Error("removeFamilySeat: family group not found");
    if (snap.data().ownerUid !== ownerUid) {
      throw new Error("removeFamilySeat: only the group owner can remove seats");
    }
    tx.update(groupRef, {
      seats: FieldValue.arrayRemove(seatUid),
      restrictedSeats: FieldValue.arrayRemove(seatUid),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.delete(db.collection(COLLECTION).doc(seatUid));
  });
  return { groupId, seatUid, removed: true };
}

/*
 * Restrict or unrestrict a family member. Restricted members cannot
 * consume scans (consumeScan returns reason "restricted"). Only the
 * owner can restrict; cannot restrict themselves.
 */
async function restrictFamilySeat(db, groupId, ownerUid, seatUid, restricted) {
  if (!groupId || !ownerUid || !seatUid) {
    throw new Error("restrictFamilySeat: groupId, ownerUid, and seatUid required");
  }
  if (seatUid === ownerUid) {
    throw new Error("restrictFamilySeat: owner cannot restrict themselves");
  }
  const groupRef = db.collection(FAMILY_COLLECTION).doc(groupId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(groupRef);
    if (!snap.exists) throw new Error("restrictFamilySeat: family group not found");
    const group = snap.data();
    if (group.ownerUid !== ownerUid) {
      throw new Error("restrictFamilySeat: only the group owner can restrict seats");
    }
    const seats = Array.isArray(group.seats) ? group.seats : [];
    if (!seats.includes(seatUid)) {
      throw new Error("restrictFamilySeat: not a member of this group");
    }
    tx.update(groupRef, {
      restrictedSeats: restricted
        ? FieldValue.arrayUnion(seatUid)
        : FieldValue.arrayRemove(seatUid),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  return { groupId, seatUid, restricted: !!restricted };
}

module.exports = {
  getEntitlement,
  getFamilyGroup,
  checkEntitlement,
  checkDeepDiveEntitlement,
  consumeScan,
  consumeDeepDive,
  grantEntitlement,
  grantTopUp,
  linkFamilySeat,
  removeFamilySeat,
  restrictFamilySeat,
  GRANTS,
  PERIOD_MS,
  MAX_FAMILY_SEATS,
};

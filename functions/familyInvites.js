/**
 * @file functions/familyInvites.js
 * @class Class 2
 * @cap 250 lines
 * @responsibility Family plan invites: the owner invites by email, the
 *   invitee accepts or declines in the app, and only then takes a seat.
 * @dependencies ./entitlementStore
 * @security_gate An invite is only answerable by the account whose verified
 *   email it names. Accepting never overwrites an individual paid plan or a
 *   seat in another family (that would wipe their scans and top-up bank).
 * @owner_context 411 Scanner Family plan (storyboard Epic 12).
 *
 * Doc shape at family_invites/{groupId}__{encoded email}:
 *   { groupId, ownerUid, ownerEmail, email, createdAtMs }
 * A pending invite holds a seat: seats + pending invites never exceed 4.
 */

const {
  getEntitlement,
  getFamilyGroup,
  linkFamilySeat,
  MAX_FAMILY_SEATS,
} = require("./entitlementStore");

const INVITES = "family_invites";

function inviteError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function inviteIdFor(groupId, email) {
  return `${groupId}__${encodeURIComponent(email)}`;
}

async function listGroupInvites(db, groupId) {
  const snap = await db.collection(INVITES).where("groupId", "==", groupId).get();
  return snap.docs.map((d) => ({ inviteId: d.id, ...d.data() }));
}

async function listInvitesForEmail(db, email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return [];
  const snap = await db.collection(INVITES).where("email", "==", normalized).get();
  return snap.docs.map((d) => ({ inviteId: d.id, ...d.data() }));
}

/*
 * Owner invites an email. Works whether or not that person has signed in
 * yet: the invite waits until they open the app and answer it.
 * existingSeatUid: the invitee's uid if they already have an account.
 */
async function createFamilyInvite(db, { ownerUid, ownerEmail, email, existingSeatUid = null }) {
  const target = normalizeEmail(email);
  if (!target || !target.includes("@")) {
    throw inviteError("invalid-argument", "Enter a valid email address.");
  }
  if (target === normalizeEmail(ownerEmail) || existingSeatUid === ownerUid) {
    throw inviteError("invalid-argument", "You can't invite yourself.");
  }

  const ent = await getEntitlement(db, ownerUid);
  const groupId = ent && ent.familyGroupId;
  const group = await getFamilyGroup(db, groupId);
  if (!group) throw inviteError("failed-precondition", "No Family plan found on this account.");
  if (group.ownerUid !== ownerUid) {
    throw inviteError("permission-denied", "Only the plan owner can invite members.");
  }

  const seats = Array.isArray(group.seats) ? group.seats : [];
  if (existingSeatUid && seats.includes(existingSeatUid)) {
    throw inviteError("already-exists", "That person is already in your family.");
  }

  const inviteId = inviteIdFor(groupId, target);
  const pending = (await listGroupInvites(db, groupId)).filter((i) => i.inviteId !== inviteId);
  if (seats.length + pending.length >= MAX_FAMILY_SEATS) {
    throw inviteError(
      "resource-exhausted",
      `Your family is full (${MAX_FAMILY_SEATS} seats, including pending invites).`
    );
  }

  await db.collection(INVITES).doc(inviteId).set({
    groupId,
    ownerUid,
    ownerEmail: normalizeEmail(ownerEmail),
    email: target,
    createdAtMs: Date.now(),
  });
  return { inviteId, email: target, pending: true };
}

async function cancelFamilyInvite(db, { ownerUid, email }) {
  const ent = await getEntitlement(db, ownerUid);
  const groupId = ent && ent.familyGroupId;
  const group = await getFamilyGroup(db, groupId);
  if (!group || group.ownerUid !== ownerUid) {
    throw inviteError("permission-denied", "Only the plan owner can cancel invites.");
  }
  await db.collection(INVITES).doc(inviteIdFor(groupId, normalizeEmail(email))).delete();
  return { cancelled: true };
}

/*
 * Why this account can't join a family right now, or null if it can.
 * An individual plan or another family's seat would be overwritten by the
 * family pointer, losing the member's own scans and top-up bank.
 */
async function joinBlocker(db, uid, groupId) {
  const ent = await getEntitlement(db, uid);
  if (!ent) return null;
  if (ent.familyGroupId) {
    if (ent.familyGroupId === groupId) return null;
    const other = await getFamilyGroup(db, ent.familyGroupId);
    if (!other) return null; // orphaned pointer: nothing to lose
    return other.ownerUid === uid
      ? "You own a Family plan. Cancel it before joining another family."
      : "You're already in another family. Leave it before joining this one.";
  }
  return "You have your own subscription. Cancel it before joining a family so you don't lose your scans.";
}

/*
 * Invitee accepts or declines. Only the account whose verified email the
 * invite names may answer it.
 */
async function respondToFamilyInvite(db, { inviteId, uid, email, accept }) {
  const ref = db.collection(INVITES).doc(String(inviteId || ""));
  const snap = await ref.get();
  if (!snap.exists) throw inviteError("not-found", "This invite is no longer available.");
  const invite = snap.data();
  if (!uid || normalizeEmail(email) !== invite.email) {
    throw inviteError("permission-denied", "This invite was sent to a different account.");
  }

  if (!accept) {
    await ref.delete();
    return { declined: true };
  }

  const group = await getFamilyGroup(db, invite.groupId);
  if (!group || group.ownerUid !== invite.ownerUid) {
    await ref.delete();
    throw inviteError("not-found", "This Family plan no longer exists.");
  }

  const blocker = await joinBlocker(db, uid, invite.groupId);
  if (blocker) throw inviteError("failed-precondition", blocker);

  try {
    await linkFamilySeat(db, invite.groupId, invite.ownerUid, uid);
  } catch (e) {
    if (/full/i.test(e.message)) {
      throw inviteError("resource-exhausted", "This family is already full.");
    }
    throw e;
  }

  // Joined: this and any other pending invites for the email are spent.
  for (const other of await listInvitesForEmail(db, invite.email)) {
    await db.collection(INVITES).doc(other.inviteId).delete();
  }
  return { joined: true, groupId: invite.groupId };
}

module.exports = {
  createFamilyInvite,
  cancelFamilyInvite,
  respondToFamilyInvite,
  listGroupInvites,
  listInvitesForEmail,
  normalizeEmail,
};

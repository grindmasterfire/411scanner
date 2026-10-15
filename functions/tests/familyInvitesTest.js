/**
 * Family invites: owner invites by email (account or not), the invitee
 * accepts or declines, pending invites hold seats, and joining never
 * overwrites someone's own plan. Run: node tests/familyInvitesTest.js
 */
const Module = require("module");
const SERVER_TS = Symbol("serverTs");
const ARRAY_UNION = Symbol("arrayUnion");
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "firebase-admin/firestore") {
    return {
      FieldValue: {
        serverTimestamp: () => ({ [SERVER_TS]: true }),
        arrayUnion: (...v) => ({ [ARRAY_UNION]: v }),
        increment: (n) => n,
        arrayRemove: () => [],
      },
    };
  }
  return origLoad.call(this, request, parent, isMain);
};

const assert = require("assert");
const copy = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));

function apply(cur, fields) {
  const next = { ...(cur || {}) };
  for (const [k, v] of Object.entries(fields)) {
    if (v && typeof v === "object" && ARRAY_UNION in v) {
      next[k] = [...new Set([...(next[k] || []), ...v[ARRAY_UNION]])];
    } else if (v && typeof v === "object" && SERVER_TS in v) {
      next[k] = Date.now();
    } else next[k] = v;
  }
  return next;
}

class MockDb {
  constructor() { this.store = new Map(); }
  collection(name) {
    const db = this;
    const ref = (id) => ({
      id,
      path: `${name}/${id}`,
      get: async () => snapOf(db, `${name}/${id}`, ref(id)),
      set: async (data, opt) => db.store.set(`${name}/${id}`, opt && opt.merge ? apply(db.store.get(`${name}/${id}`), data) : copy(data)),
      update: async (data) => db.store.set(`${name}/${id}`, apply(db.store.get(`${name}/${id}`), data)),
      delete: async () => db.store.delete(`${name}/${id}`),
    });
    return {
      doc: ref,
      where: (field, op, value) => ({
        get: async () => ({
          docs: [...db.store.entries()]
            .filter(([p, d]) => p.startsWith(`${name}/`) && d[field] === value)
            .map(([p, d]) => ({ id: p.slice(name.length + 1), data: () => copy(d) })),
        }),
      }),
    };
  }
  async runTransaction(fn) {
    const db = this;
    return fn({
      get: async (r) => snapOf(db, r.path, r),
      update: (r, f) => db.store.set(r.path, apply(db.store.get(r.path), f)),
      set: (r, d, opt) => db.store.set(r.path, opt && opt.merge ? apply(db.store.get(r.path), d) : copy(d)),
      delete: (r) => db.store.delete(r.path),
    });
  }
  seed(path, data) { this.store.set(path, copy(data)); }
  read(path) { return copy(this.store.get(path)); }
}
function snapOf(db, path, ref) {
  const d = db.store.get(path);
  return { exists: d !== undefined, data: () => copy(d), ref };
}

const fi = require("../familyInvites");

function familyDb() {
  const db = new MockDb();
  db.seed("familyGroups/g1", { ownerUid: "owner", seats: ["owner"], scansAllowed: 40, scansUsed: 0, topUpScans: 25 });
  db.seed("entitlements/owner", { tier: "family", familyGroupId: "g1" });
  return db;
}
const OWNER = { ownerUid: "owner", ownerEmail: "Owner@Example.com" };

async function rejects(p, code) {
  await assert.rejects(p, (e) => { assert.equal(e.code, code, e.message); return true; });
}

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test("invite works for an email with no account yet; invitee accepts and joins", async () => {
  const db = familyDb();
  const out = await fi.createFamilyInvite(db, { ...OWNER, email: " New@Person.com " });
  assert.equal(out.pending, true);
  const mine = await fi.listInvitesForEmail(db, "new@person.com");
  assert.equal(mine.length, 1);
  assert.equal(mine[0].ownerEmail, "owner@example.com");
  // Later they sign in (new uid) and accept.
  const r = await fi.respondToFamilyInvite(db, { inviteId: mine[0].inviteId, uid: "newbie", email: "new@person.com", accept: true });
  assert.equal(r.joined, true);
  assert.deepEqual(db.read("familyGroups/g1").seats, ["owner", "newbie"]);
  assert.equal(db.read("entitlements/newbie").familyGroupId, "g1");
  assert.equal((await fi.listInvitesForEmail(db, "new@person.com")).length, 0, "invite spent");
});

test("decline removes the invite and joins nothing", async () => {
  const db = familyDb();
  const { inviteId } = await fi.createFamilyInvite(db, { ...OWNER, email: "a@b.com" });
  await fi.respondToFamilyInvite(db, { inviteId, uid: "u2", email: "a@b.com", accept: false });
  assert.equal(db.read(`family_invites/${inviteId}`), undefined);
  assert.deepEqual(db.read("familyGroups/g1").seats, ["owner"]);
});

test("only the invited email can answer", async () => {
  const db = familyDb();
  const { inviteId } = await fi.createFamilyInvite(db, { ...OWNER, email: "a@b.com" });
  await rejects(fi.respondToFamilyInvite(db, { inviteId, uid: "x", email: "other@b.com", accept: true }), "permission-denied");
});

test("pending invites hold seats: 4 total", async () => {
  const db = familyDb();
  await fi.createFamilyInvite(db, { ...OWNER, email: "1@x.com" });
  await fi.createFamilyInvite(db, { ...OWNER, email: "2@x.com" });
  await fi.createFamilyInvite(db, { ...OWNER, email: "3@x.com" });
  await rejects(fi.createFamilyInvite(db, { ...OWNER, email: "4@x.com" }), "resource-exhausted");
  // Re-sending an existing invite is not a new seat.
  await fi.createFamilyInvite(db, { ...OWNER, email: "3@x.com" });
  // Cancelling frees the seat.
  await fi.cancelFamilyInvite(db, { ownerUid: "owner", email: "3@x.com" });
  await fi.createFamilyInvite(db, { ...OWNER, email: "4@x.com" });
});

test("cannot invite yourself or an existing member", async () => {
  const db = familyDb();
  await rejects(fi.createFamilyInvite(db, { ...OWNER, email: "owner@example.com" }), "invalid-argument");
  await rejects(fi.createFamilyInvite(db, { ...OWNER, email: "x@y.com", existingSeatUid: "owner" }), "invalid-argument");
  db.seed("familyGroups/g1", { ownerUid: "owner", seats: ["owner", "m1"] });
  await rejects(fi.createFamilyInvite(db, { ...OWNER, email: "m1@y.com", existingSeatUid: "m1" }), "already-exists");
  await rejects(fi.createFamilyInvite(db, { ...OWNER, email: "not-an-email" }), "invalid-argument");
});

test("only the owner can invite or cancel", async () => {
  const db = familyDb();
  db.seed("entitlements/member", { tier: "family", familyGroupId: "g1" });
  await rejects(fi.createFamilyInvite(db, { ownerUid: "member", ownerEmail: "m@x.com", email: "z@x.com" }), "permission-denied");
  await rejects(fi.cancelFamilyInvite(db, { ownerUid: "member", email: "z@x.com" }), "permission-denied");
  await rejects(fi.createFamilyInvite(db, { ownerUid: "nobody", ownerEmail: "n@x.com", email: "z@x.com" }), "failed-precondition");
});

test("joining never overwrites the invitee's own paid plan or top-up bank", async () => {
  const db = familyDb();
  db.seed("entitlements/pro", { tier: "pro", familyGroupId: null, scansAllowed: 60, topUpScans: 20 });
  const { inviteId } = await fi.createFamilyInvite(db, { ...OWNER, email: "pro@x.com" });
  await rejects(fi.respondToFamilyInvite(db, { inviteId, uid: "pro", email: "pro@x.com", accept: true }), "failed-precondition");
  assert.equal(db.read("entitlements/pro").topUpScans, 20, "bank untouched");
  assert.equal(db.read("entitlements/pro").tier, "pro");
  assert.ok(db.read(`family_invites/${inviteId}`), "invite stays so they can accept after cancelling");
});

test("member of another family is refused; orphaned pointer is fine", async () => {
  const db = familyDb();
  db.seed("familyGroups/g2", { ownerUid: "o2", seats: ["o2", "m2"] });
  db.seed("entitlements/m2", { tier: "family", familyGroupId: "g2" });
  const { inviteId } = await fi.createFamilyInvite(db, { ...OWNER, email: "m2@x.com" });
  await rejects(fi.respondToFamilyInvite(db, { inviteId, uid: "m2", email: "m2@x.com", accept: true }), "failed-precondition");

  db.seed("entitlements/ghost", { tier: "family", familyGroupId: "gone" });
  const second = await fi.createFamilyInvite(db, { ...OWNER, email: "ghost@x.com" });
  const r = await fi.respondToFamilyInvite(db, { inviteId: second.inviteId, uid: "ghost", email: "ghost@x.com", accept: true });
  assert.equal(r.joined, true);
});

test("invite to a family that no longer exists is cleaned up", async () => {
  const db = familyDb();
  const { inviteId } = await fi.createFamilyInvite(db, { ...OWNER, email: "a@b.com" });
  db.store.delete("familyGroups/g1");
  await rejects(fi.respondToFamilyInvite(db, { inviteId, uid: "u", email: "a@b.com", accept: true }), "not-found");
  assert.equal(db.read(`family_invites/${inviteId}`), undefined);
});

(async () => {
  let passed = 0;
  for (const [name, fn] of tests) {
    try { await fn(); passed++; console.log(`  ok: ${name}`); }
    catch (e) { console.error(`  FAIL: ${name}\n    ${e.stack}`); process.exitCode = 1; }
  }
  console.log(`${passed}/${tests.length} passed`);
})();

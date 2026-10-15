/**
 * Ad gate tests: AdMob SSV signature verification, single-use tickets, the
 * free-tier rolling weekly counter, and the tester/Professional/subscriber
 * paths. Google's signing key is replaced by a locally generated P-256 key.
 * Run: node tests/adGateTest.js
 */
const assert = require("node:assert/strict");
const crypto = require("crypto");
const Module = require("module");

const INCREMENT = Symbol("increment");
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "firebase-admin/firestore") {
    return { FieldValue: { increment: (n) => ({ [INCREMENT]: n }) } };
  }
  return origLoad.call(this, request, parent, isMain);
};

const copy = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
function applyFields(cur, fields) {
  const next = { ...(cur || {}) };
  for (const [k, v] of Object.entries(fields)) {
    next[k] = v && typeof v === "object" && INCREMENT in v
      ? (Number(next[k]) || 0) + v[INCREMENT]
      : v;
  }
  return next;
}
class MockDb {
  constructor() { this.store = new Map(); }
  collection(name) {
    const db = this;
    return {
      doc: (id) => {
        const path = `${name}/${id}`;
        return {
          path,
          get: async () => db._snap(path),
          set: async (data, opts) => db._set(path, data, opts),
          update: async (fields) => {
            if (!db.store.has(path)) throw new Error("NOT_FOUND");
            db.store.set(path, applyFields(db.store.get(path), fields));
          },
        };
      },
    };
  }
  _snap(path) {
    const d = this.store.get(path);
    return { exists: d !== undefined, data: () => copy(d) };
  }
  _set(path, data, opts) {
    const base = opts && opts.merge ? this.store.get(path) : {};
    this.store.set(path, applyFields(base, data));
  }
  async runTransaction(fn) {
    const writes = [];
    const tx = {
      get: async (ref) => this._snap(ref.path),
      set: (ref, data, opts) => writes.push(() => this._set(ref.path, data, opts)),
      update: (ref, fields) => writes.push(() =>
        this.store.set(ref.path, applyFields(this.store.get(ref.path), fields))),
    };
    const result = await fn(tx); // a throw discards every buffered write
    writes.forEach((w) => w());
    return result;
  }
  read(path) { return copy(this.store.get(path)); }
}

const gate = require("../adGate");
gate._setTicketWait(30, 10);

const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
gate._setVerifierKeys({ "42": publicKey.export({ type: "spki", format: "pem" }) });

function signedQuery(fields, { tamper = false, keyId = "42" } = {}) {
  const base = new URLSearchParams({
    ad_network: "5450213213286189855",
    ad_unit: "8930397909",
    reward_amount: "1",
    reward_item: "scan",
    timestamp: String(Date.now()),
    ...fields,
  }).toString();
  const sig = crypto.sign("sha256", Buffer.from(base), privateKey).toString("base64url");
  return `${tamper ? base + "x" : base}&signature=${sig}&key_id=${keyId}`;
}

const UID = "user-a";
const ticket = () => crypto.randomUUID();
async function verifiedTicket(db, uid = UID, extra = {}) {
  const t = ticket();
  const out = await gate.handleSsvCallback(db, signedQuery({
    transaction_id: crypto.randomUUID(), user_id: uid, custom_data: t, ...extra,
  }));
  assert.equal(out.body, "verified");
  return t;
}
async function rejects(promise, code5) {
  await assert.rejects(promise, (e) => e.details && e.details.code5 === code5);
}

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test("valid SSV callback creates a ticket bound to the uid", async () => {
  const db = new MockDb();
  const t = await verifiedTicket(db);
  const doc = db.read(`ad_tickets/${t}`);
  assert.equal(doc.uid, UID);
  assert.equal(doc.consumedAtMs, null);
});

test("tampered query and unknown key are rejected with 403", async () => {
  const db = new MockDb();
  const q = { transaction_id: "tx1", user_id: UID, custom_data: ticket() };
  assert.equal((await gate.handleSsvCallback(db, signedQuery(q, { tamper: true }))).status, 403);
  gate._setVerifierKeys({ "42": publicKey.export({ type: "spki", format: "pem" }) });
  const realFetch = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => ({ keys: [] }) });
  try {
    assert.equal((await gate.handleSsvCallback(db, signedQuery(q, { keyId: "99" }))).status, 403);
  } finally {
    global.fetch = realFetch;
    gate._setVerifierKeys({ "42": publicKey.export({ type: "spki", format: "pem" }) });
  }
  assert.equal(db.store.size, 0);
});

test("duplicate transaction is acknowledged once", async () => {
  const db = new MockDb();
  const q = signedQuery({ transaction_id: "tx-dup", user_id: UID, custom_data: ticket() });
  assert.equal((await gate.handleSsvCallback(db, q)).body, "verified");
  assert.equal((await gate.handleSsvCallback(db, q)).body, "duplicate");
});

test("wrong ad unit or missing ticket is ignored (200, no ticket)", async () => {
  const db = new MockDb();
  const t = ticket();
  const a = await gate.handleSsvCallback(db, signedQuery({ transaction_id: "t1", user_id: UID, custom_data: t, ad_unit: "123" }));
  const b = await gate.handleSsvCallback(db, signedQuery({ transaction_id: "t2", user_id: UID }));
  assert.equal(a.status, 200); assert.equal(a.body, "ignored");
  assert.equal(b.status, 200); assert.equal(b.body, "ignored");
  assert.equal(db.read(`ad_tickets/${t}`), undefined);
});

test("tester and professional skip the ad entirely", async () => {
  const db = new MockDb();
  assert.equal((await gate.enforceAdGate(db, { uid: UID, isTester: true })).mode, "tester");
  assert.equal((await gate.enforceAdGate(db, { uid: UID, tier: "pro" })).mode, "professional");
  assert.equal(db.store.size, 0);
});

test("no uid is rejected as sign-in (80101)", async () => {
  await rejects(gate.enforceAdGate(new MockDb(), { uid: null, adTicket: ticket() }), "80101");
});

test("free tier without a verified ticket is rejected (60102)", async () => {
  const db = new MockDb();
  await rejects(gate.enforceAdGate(db, { uid: UID }), "60102");
  await rejects(gate.enforceAdGate(db, { uid: UID, adTicket: ticket() }), "60102");
  await rejects(gate.enforceAdGate(db, { uid: UID, adTicket: ticket(), adNoFill: true }), "60102");
  assert.equal(db.read(`free_usage/${UID}`), undefined);
});

test("free tier: verified ticket spends the week's one scan", async () => {
  const db = new MockDb();
  const out = await gate.enforceAdGate(db, { uid: UID, adTicket: await verifiedTicket(db) });
  assert.equal(out.mode, "free_verified");
  assert.equal(db.read(`free_usage/${UID}`).scansUsed, 1);
  await rejects(gate.enforceAdGate(db, { uid: UID, adTicket: await verifiedTicket(db) }), "60101");
  assert.equal((await gate.getFreeUsage(db, UID)).freeScansUsed, 1);
});

test("a ticket works once, only for its own uid", async () => {
  const db = new MockDb();
  const t = await verifiedTicket(db, "user-b");
  await rejects(gate.enforceAdGate(db, { uid: UID, adTicket: t }), "60102");
  await gate.enforceAdGate(db, { uid: "user-b", tier: "standard", adTicket: t });
  await rejects(gate.enforceAdGate(db, { uid: "user-b", tier: "standard", adTicket: t }), "60102");
});

test("expired ticket is rejected", async () => {
  const db = new MockDb();
  const t = await verifiedTicket(db);
  db.store.get(`ad_tickets/${t}`).expiresAtMs = Date.now() - 1;
  await rejects(gate.enforceAdGate(db, { uid: UID, adTicket: t }), "60102");
});

test("free window rolls over after 7 days", async () => {
  const db = new MockDb();
  db.store.set(`free_usage/${UID}`, { windowStartMs: Date.now() - 8 * 864e5, scansUsed: 1 });
  await gate.enforceAdGate(db, { uid: UID, adTicket: await verifiedTicket(db) });
  const u = db.read(`free_usage/${UID}`);
  assert.equal(u.scansUsed, 1);
  assert.ok(Date.now() - u.windowStartMs < 5000, "new window starts now");
});

test("ticket arriving during the wait is accepted", async () => {
  const db = new MockDb();
  gate._setTicketWait(500, 10);
  const t = ticket();
  setTimeout(() => gate.handleSsvCallback(db, signedQuery({
    transaction_id: "late", user_id: UID, custom_data: t })), 50);
  const out = await gate.enforceAdGate(db, { uid: UID, adTicket: t });
  gate._setTicketWait(30, 10);
  assert.equal(out.mode, "free_verified");
});

test("subscriber: verified ticket required; no-fill passes and is logged", async () => {
  const db = new MockDb();
  await rejects(gate.enforceAdGate(db, { uid: UID, tier: "rental" }), "60102");
  const nf = await gate.enforceAdGate(db, { uid: UID, tier: "rental", adNoFill: true });
  assert.equal(nf.mode, "subscriber_no_fill");
  await gate.enforceAdGate(db, { uid: UID, tier: "rental", adNoFill: true });
  assert.equal(db.read(`ad_nofill/${UID}`).claims, 2);
  const ok = await gate.enforceAdGate(db, { uid: UID, tier: "rental", adTicket: await verifiedTicket(db) });
  assert.equal(ok.mode, "subscriber_verified");
  assert.equal(db.read(`free_usage/${UID}`), undefined, "subscribers never touch the free counter");
});

test("released subscriber ticket can be reused after a quota refusal", async () => {
  const db = new MockDb();
  const t = await verifiedTicket(db);
  const g = await gate.enforceAdGate(db, { uid: UID, tier: "rental", adTicket: t });
  await gate.releaseAdGate(db, g);
  assert.equal((await gate.enforceAdGate(db, { uid: UID, tier: "rental", adTicket: t })).mode, "subscriber_verified");
});

const DEVICE = "a".repeat(64);

test("free scan is per device too: a new anonymous account on the same phone gets none (60101)", async () => {
  const db = new MockDb();
  const out = await gate.enforceAdGate(db, { uid: UID, adTicket: await verifiedTicket(db), deviceKey: DEVICE });
  assert.equal(out.mode, "free_verified");
  // Clearing app data = new anonymous uid, same Android ID.
  await rejects(gate.enforceAdGate(db, { uid: "user-b", adTicket: await verifiedTicket(db, "user-b"), deviceKey: DEVICE }), "60101");
  const usage = await gate.getFreeUsage(db, "user-b", DEVICE);
  assert.equal(usage.freeScansUsed, 1, "badge shows the device's used scan");
  assert.ok(![...db.store.keys()].some((k) => k.includes(DEVICE)), "raw device key never stored");
});

test("a different device still gets its own free scan", async () => {
  const db = new MockDb();
  await gate.enforceAdGate(db, { uid: UID, adTicket: await verifiedTicket(db), deviceKey: DEVICE });
  const other = await gate.enforceAdGate(db, { uid: "user-b", adTicket: await verifiedTicket(db, "user-b"), deviceKey: "b".repeat(64) });
  assert.equal(other.mode, "free_verified");
});

test("malformed device key is ignored (account rule still applies)", async () => {
  const db = new MockDb();
  await gate.enforceAdGate(db, { uid: UID, adTicket: await verifiedTicket(db), deviceKey: "not-a-key" });
  await rejects(gate.enforceAdGate(db, { uid: UID, adTicket: await verifiedTicket(db), deviceKey: "not-a-key" }), "60101");
});

(async () => {
  let failed = 0;
  for (const [name, fn] of tests) {
    try { await fn(); console.log(`  ok: ${name}`); }
    catch (e) { failed++; console.error(`  FAIL: ${name}\n    ${e.stack.split("\n").slice(0, 3).join("\n    ")}`); }
  }
  console.log(`${tests.length - failed}/${tests.length} passed`);
  process.exitCode = failed ? 1 : 0;
})();

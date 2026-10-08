/**
 * Transactional consume tests: the check-and-deduct for scans and deep
 * dives must be atomic, so concurrent bursts cannot overdraft a bucket.
 * Uses a minimal Firestore mock with optimistic-concurrency transactions.
 * Run: node tests/entitlementTransactionTest.js
 */
const Module = require("module");
const INCREMENT = Symbol("increment");
const SERVER_TS = Symbol("serverTs");
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "firebase-admin/firestore") {
    return {
      FieldValue: {
        increment: (n) => ({ [INCREMENT]: n }),
        serverTimestamp: () => ({ [SERVER_TS]: true }),
      },
    };
  }
  return origLoad.call(this, request, parent, isMain);
};

const tick = () => new Promise((r) => setImmediate(r));
const deepCopy = (o) => JSON.parse(JSON.stringify(o));

class MockDb {
  constructor() {
    this.store = new Map();
    this.versions = new Map();
  }
  collection(name) {
    const db = this;
    return { doc: (id) => ({ path: `${name}/${id}`, id }) };
  }
  async runTransaction(fn) {
    for (let a = 0; a < 5; a++) {
      const readVersions = new Map();
      const writes = [];
      const db = this;
      const tx = {
        get: async (ref) => {
          await tick();
          const data = db.store.get(ref.path);
          readVersions.set(ref.path, db.versions.get(ref.path) || 0);
          return {
            exists: data !== undefined,
            data: () => (data === undefined ? undefined : deepCopy(data)),
            ref,
          };
        },
        update: (ref, fields) => writes.push([ref, fields]),
      };
      const result = await fn(tx);
      let conflict = false;
      for (const [p, v] of readVersions) {
        if ((db.versions.get(p) || 0) !== v) { conflict = true; break; }
      }
      if (conflict) continue;
      for (const [ref, fields] of writes) {
        const cur = db.store.get(ref.path);
        const next = { ...cur };
        for (const [k, v] of Object.entries(fields)) {
          if (v && typeof v === "object" && INCREMENT in v) {
            next[k] = (Number(next[k]) || 0) + v[INCREMENT];
          } else if (v && typeof v === "object" && SERVER_TS in v) {
            next[k] = Date.now();
          } else next[k] = v;
        }
        db.store.set(ref.path, next);
        db.versions.set(ref.path, (db.versions.get(ref.path) || 0) + 1);
      }
      return result;
    }
    throw new Error("tx contention");
  }
  seed(path, data) { this.store.set(path, deepCopy(data)); }
  read(path) { return deepCopy(this.store.get(path)); }
}

const store = require("../entitlementStore");
const jitter = () => new Promise((r) => setTimeout(r, Math.floor(Math.random() * 5)));

let passed = 0;
async function check(name, fn) {
  try { await fn(); passed++; console.log(`  ok: ${name}`); }
  catch (e) { console.error(`  FAIL: ${name}\n    ${e.message}`); process.exitCode = 1; }
}
const assert = require("node:assert/strict");

(async () => {
console.log("== entitlement transactions ==");

await check("concurrent scans cannot exceed the bucket", async () => {
  const db = new MockDb();
  db.seed("entitlements/u", {
    tier: "standard", scansAllowed: 3, scansUsed: 0, topUpScans: 0,
    anniversaryEpochMs: Date.now() + 864e5, periodMs: 864e5,
  });
  let served = 0;
  await Promise.all(Array.from({ length: 20 }, async () => {
    await jitter();
    const r = await store.consumeScan(db, "u");
    if (r.consumed) served++;
  }));
  assert.equal(served, 3);
  assert.equal(db.read("entitlements/u").scansUsed, 3);
});

await check("top-up fallback is transactional", async () => {
  const db = new MockDb();
  db.seed("entitlements/u", {
    tier: "standard", scansAllowed: 0, scansUsed: 0, topUpScans: 2,
    anniversaryEpochMs: Date.now() + 864e5, periodMs: 864e5,
  });
  let served = 0;
  await Promise.all(Array.from({ length: 10 }, async () => {
    await jitter();
    const r = await store.consumeScan(db, "u");
    if (r.consumed) served++;
  }));
  assert.equal(served, 2);
  assert.equal(db.read("entitlements/u").topUpScans, 0);
});

await check("deep dive consume is transactional", async () => {
  const db = new MockDb();
  db.seed("entitlements/u", {
    tier: "pro", scansAllowed: 60, scansUsed: 0, topUpScans: 1,
    anniversaryEpochMs: Date.now() + 864e5, periodMs: 864e5,
  });
  let served = 0;
  await Promise.all(Array.from({ length: 10 }, async () => {
    await jitter();
    const r = await store.consumeDeepDive(db, "u");
    if (r.consumed) served++;
  }));
  assert.equal(served, 1);
  assert.equal(db.read("entitlements/u").topUpScans, 0);
});

await check("empty deep-dive bank refuses without going negative", async () => {
  const db = new MockDb();
  db.seed("entitlements/u", {
    tier: "pro", scansAllowed: 60, scansUsed: 0, topUpScans: 0,
    anniversaryEpochMs: Date.now() + 864e5, periodMs: 864e5,
  });
  const r = await store.consumeDeepDive(db, "u");
  assert.equal(r.consumed, false);
  assert.equal(r.reason, "empty_bank");
});

await check("family shared bucket is transactional", async () => {
  const db = new MockDb();
  db.seed("familyGroups/f1", {
    scansAllowed: 5, scansUsed: 0, topUpScans: 0,
    anniversaryEpochMs: Date.now() + 864e5, periodMs: 864e5,
  });
  for (let i = 0; i < 8; i++) {
    db.seed(`entitlements/m${i}`, { tier: "family", familyGroupId: "f1" });
  }
  let served = 0;
  await Promise.all(Array.from({ length: 8 }, async (_, i) => {
    await jitter();
    const r = await store.consumeScan(db, `m${i}`);
    if (r.consumed) served++;
  }));
  assert.equal(served, 5);
  assert.equal(db.read("familyGroups/f1").scansUsed, 5);
});

console.log(`\n${passed} transaction checks passed${process.exitCode ? " (WITH FAILURES)" : ""}.`);
})();

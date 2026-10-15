/**
 * Each Play order is credited exactly once, to the account that bought it.
 * Run: node tests/purchaseLedgerTest.js
 */
const Module = require("module");
const orig = Module._load;
Module._load = function (req, parent, isMain) {
  if (req === "firebase-admin/firestore") return { FieldValue: { serverTimestamp: () => "ts" } };
  return orig.call(this, req, parent, isMain);
};
const assert = require("assert");
const { orderKeyFor, accountFingerprint, claimOrder } = require("../purchaseLedger");

class MockDb {
  constructor() { this.store = new Map(); }
  collection(n) { return { doc: (id) => ({ path: `${n}/${id}` }) }; }
  async runTransaction(fn) {
    const db = this;
    return fn({
      get: async (r) => ({ exists: db.store.has(r.path), data: () => db.store.get(r.path) }),
      set: (r, d) => db.store.set(r.path, d),
    });
  }
}

(async () => {
  const db = new MockDb();
  const key = orderKeyFor({ orderId: "GPA.1234-5678-9012-34567", purchaseToken: "tok" });
  assert.equal(key, "GPA.1234-5678-9012-34567");

  // First credit, then every app-launch re-send is a no-op.
  assert.deepEqual(await claimOrder(db, { orderKey: key, uid: "u1", productId: "pro_monthly" }), { fresh: true });
  assert.deepEqual(await claimOrder(db, { orderKey: key, uid: "u1", productId: "pro_monthly" }), { fresh: false, sameAccount: true });
  // Someone else presenting the same order is refused.
  assert.deepEqual(await claimOrder(db, { orderKey: key, uid: "u2", productId: "pro_monthly" }), { fresh: false, sameAccount: false });

  // A renewal is a new order ID: credited once more.
  const renewal = orderKeyFor({ orderId: "GPA.1234-5678-9012-34567..0" });
  assert.deepEqual(await claimOrder(db, { orderKey: renewal, uid: "u1", productId: "pro_monthly" }), { fresh: true });

  // Without a verified order ID, the token itself is the key (no raw token stored).
  const tk = orderKeyFor({ orderId: null, purchaseToken: "abc" });
  assert.match(tk, /^token:[0-9a-f]{64}$/);
  assert.ok(!tk.includes("abc"));

  // Account fingerprint fits Play's 64-char obfuscatedAccountId and is stable.
  assert.equal(accountFingerprint("u1").length, 64);
  assert.equal(accountFingerprint("u1"), accountFingerprint("u1"));
  assert.notEqual(accountFingerprint("u1"), accountFingerprint("u2"));
  console.log("purchaseLedgerTest: all passed");
})().catch((e) => { console.error(e); process.exitCode = 1; });

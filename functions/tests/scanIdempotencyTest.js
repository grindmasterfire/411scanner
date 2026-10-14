/**
 * Scan idempotency: a client request ID is claimed before anything is
 * charged, and a resend never runs twice. Run: node tests/scanIdempotencyTest.js
 */
const assert = require("assert");
const wf = require("../scanWorkflow");

class MockDb {
  constructor() { this.store = new Map(); this.failCreate = null; }
  collection(name) {
    const db = this;
    return {
      doc: (id) => {
        const path = `${name}/${id}`;
        return {
          get: async () => {
            const d = db.store.get(path);
            return { exists: d !== undefined, data: () => (d === undefined ? undefined : { ...d }) };
          },
          set: async (data) => { db.store.set(path, { ...data }); },
          create: async (data) => {
            if (db.failCreate) throw db.failCreate;
            if (db.store.has(path)) { const e = new Error("ALREADY_EXISTS"); e.code = 6; throw e; }
            db.store.set(path, { ...data });
          },
        };
      },
    };
  }
}
const ts = () => "SERVER_TS";

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

function rejectsWith(fn, check) {
  try { fn(); } catch (e) { check(e); return; }
  assert.fail("expected a throw");
}

test("first request claims the ID and runs", async () => {
  const db = new MockDb();
  assert.equal(await wf._claimScanRequest(db, ts, "r1", "u1"), null);
  const doc = db.store.get("scan_results/r1");
  assert.equal(doc.pending, true);
  assert.equal(doc.uid, "u1");
});

test("resend while running: in progress, not a second run", async () => {
  const db = new MockDb();
  await wf._claimScanRequest(db, ts, "r1", "u1");
  const existing = await wf._claimScanRequest(db, ts, "r1", "u1");
  assert.ok(existing && existing.pending);
  rejectsWith(() => wf._replayScanRequest(existing, "u1"), (e) => {
    assert.equal(e.code, "already-exists");
    assert.equal(e.details.inProgress, true);
  });
});

test("resend after success: the stored report, no rerun", async () => {
  const db = new MockDb();
  await wf._claimScanRequest(db, ts, "r1", "u1");
  db.store.set("scan_results/r1", {
    requestId: "r1", uid: "u1", consumer_card: { target_name: "X" }, createdAt: 1, expiresAt: 2,
  });
  const existing = await wf._claimScanRequest(db, ts, "r1", "u1");
  const out = wf._replayScanRequest(existing, "u1");
  assert.equal(out.consumer_card.target_name, "X");
  assert.equal(out.createdAt, undefined);
  assert.equal(out.expiresAt, undefined);
});

test("resend after failure: the stored failure, final", async () => {
  const existing = { requestId: "r1", uid: "u1", failed: true, code5: "60102", message: "ad" };
  rejectsWith(() => wf._replayScanRequest(existing, "u1"), (e) => {
    assert.equal(e.details.code5, "60102");
    assert.equal(e.message, "ad");
  });
});

test("another account cannot reuse a request ID", async () => {
  const existing = { requestId: "r1", uid: "u1", pending: true, claimedAtMs: Date.now() };
  rejectsWith(() => wf._replayScanRequest(existing, "u2"), (e) => {
    assert.equal(e.code, "already-exists");
    assert.equal(e.details, undefined);
  });
});

test("a claim with no outcome past the scan timeout is a timed-out scan", async () => {
  const doc = { pending: true, claimedAtMs: 1000 };
  assert.equal(wf.settledScanOutcome(doc, 1000 + 60 * 1000).state, "pending");
  const stale = wf.settledScanOutcome(doc, 1000 + wf.SCAN_CLAIM_STALE_MS);
  assert.equal(stale.state, "failed");
  assert.equal(stale.code5, "20301");
});

test("claim store failure falls back to running unclaimed", async () => {
  const db = new MockDb();
  db.failCreate = Object.assign(new Error("UNAVAILABLE"), { code: 14 });
  assert.equal(await wf._claimScanRequest(db, ts, "r1", "u1"), null);
});

(async () => {
  for (const [name, fn] of tests) {
    try {
      await fn();
      passed++;
      console.log(`  ok: ${name}`);
    } catch (e) {
      console.log(`  FAIL: ${name}\n    ${e.stack.split("\n").slice(0, 3).join("\n    ")}`);
    }
  }
  console.log(`${passed}/${tests.length} passed`);
  process.exitCode = passed === tests.length ? 0 : 1;
})();

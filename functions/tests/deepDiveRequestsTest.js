/**
 * Background Deep Dives (fire 2026-10-16): a request ID is claimed before
 * anything is charged; repeats return the outcome, never a second dive.
 * Run: node tests/deepDiveRequestsTest.js
 */
const assert = require("assert");
const {
  STALE_MS,
  validRequestId,
  claimDiveRequest,
  finishDiveRequest,
  replyForExisting,
  failureOutcome,
} = require("../deepDiveRequests");
const { HttpsError } = require("firebase-functions/v2/https");

function fakeDb() {
  const docs = {};
  const ref = (id) => ({
    id,
    get: async () => ({ exists: id in docs, data: () => docs[id] }),
    set: async (data, opts) => { docs[id] = opts && opts.merge ? { ...(docs[id] || {}), ...data } : { ...data }; },
  });
  return {
    docs,
    collection: (c) => ({ doc: (id) => ref(`${c}/${id}`) }),
    runTransaction: async (fn) => fn({
      get: (r) => r.get(),
      create: (r, data) => {
        if (r.id in docs) throw new Error("ALREADY_EXISTS");
        docs[r.id] = { ...data };
      },
    }),
  };
}

// The endpoint's flow, as index.js runs it around the dive.
async function endpoint(db, uid, requestId, dive) {
  const claim = await claimDiveRequest(db, uid, requestId);
  if (claim.existing) return replyForExisting(claim.existing);
  try {
    const reply = await dive();
    await finishDiveRequest(db, uid, requestId, { status: "done", text: reply.deepDive });
    return { ...reply, requestId, state: "done" };
  } catch (e) {
    await finishDiveRequest(db, uid, requestId, failureOutcome(e));
    throw e;
  }
}

(async () => {
  assert.ok(validRequestId("dd_3f9a1c2e-7b4d-4e1a-9c0f"));
  for (const bad of [undefined, "", "short", "has space here", "x".repeat(81), "../../etc"]) {
    assert.ok(!validRequestId(bad), String(bad));
  }

  // 1. First call runs the dive once; repeats return it without running again.
  {
    const db = fakeDb();
    let runs = 0;
    const dive = async () => { runs++; return { deepDive: "THE FINDING\n…" }; };
    const first = await endpoint(db, "u1", "dd_aaaaaaaa1", dive);
    assert.deepStrictEqual(first, { deepDive: "THE FINDING\n…", requestId: "dd_aaaaaaaa1", state: "done" });
    const again = await endpoint(db, "u1", "dd_aaaaaaaa1", dive);
    assert.strictEqual(again.deepDive, "THE FINDING\n…");
    assert.strictEqual(runs, 1, "a repeat never runs (or charges) a second dive");
  }

  // 2. While the first call is still working, a repeat says "pending".
  {
    const db = fakeDb();
    let release;
    const slow = () => new Promise((resolve) => { release = () => resolve({ deepDive: "done text" }); });
    const firstCall = endpoint(db, "u1", "dd_bbbbbbbb2", slow);
    await new Promise((r) => setImmediate(r));
    const poll = await endpoint(db, "u1", "dd_bbbbbbbb2", async () => { throw new Error("must not run"); });
    assert.deepStrictEqual(poll, { requestId: "dd_bbbbbbbb2", state: "pending" });
    release();
    await firstCall;
    assert.strictEqual((await endpoint(db, "u1", "dd_bbbbbbbb2", async () => { throw new Error("must not run"); })).state, "done");
  }

  // 3. A failed dive is stored; a repeat gets the same error, not a new try.
  {
    const db = fakeDb();
    const noCredit = async () => { throw new HttpsError("resource-exhausted", "Deep dive requires a top-up credit.", { code5: "40201" }); };
    await assert.rejects(endpoint(db, "u1", "dd_cccccccc3", noCredit), /top-up credit/);
    await assert.rejects(endpoint(db, "u1", "dd_cccccccc3", async () => ({ deepDive: "x" })),
      (e) => e.details && e.details.code5 === "40201");
  }

  // 4. Accounts are separate: the same ID under another account is its own request.
  {
    const db = fakeDb();
    await endpoint(db, "u1", "dd_dddddddd4", async () => ({ deepDive: "u1's dive" }));
    const other = await endpoint(db, "u2", "dd_dddddddd4", async () => ({ deepDive: "u2's dive" }));
    assert.strictEqual(other.deepDive, "u2's dive");
  }

  // 5. A dive "running" past the stale window died with its instance: one failure, no re-run.
  {
    assert.throws(() => replyForExisting({ status: "running", requestId: "x", createdAtMs: Date.now() - STALE_MS - 1 }),
      (e) => e.details.code5 === "70101");
    assert.strictEqual(replyForExisting({ status: "running", requestId: "x", createdAtMs: Date.now() }).state, "pending");
  }

  // 6. Report: background request states, stuck ones named.
  {
    const { buildDeepDiveScopeSummary, formatDeepDiveScopeSummary } = require("../deepDiveScopeReport");
    const now = Date.now();
    const s = buildDeepDiveScopeSummary([], { nowMs: now, requests: [
      { requestId: "a", status: "done" }, { requestId: "b", status: "failed" },
      { requestId: "c", status: "running", createdAtMs: now - 1000 },
      { requestId: "d", status: "running", createdAtMs: now - STALE_MS - 1 },
    ] });
    const text = formatDeepDiveScopeSummary(s, "t");
    assert.ok(text.includes("Background requests: 4 (done 1, failed 1, running 1) — STUCK: d"), text);
  }

  console.log("deepDiveRequestsTest: 6/6 groups passed");
})().catch((e) => { console.error(e); process.exit(1); });

/**
 * Business Center operations reports, on fixture data.
 * Run: node tests/businessCenterOpsTest.js
 */
const assert = require("assert");
const ops = require("../businessCenterOps");
const { researchQuality } = require("../scanDeliveryEvents");

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.parse("2026-10-14T12:00:00Z");
const day = (n) => T0 - n * DAY;

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

/* 1. Delivery ------------------------------------------------------- */

test("delivery: server counts, timing, replays, stale claims", () => {
  const events = [
    { type: "received", requestId: "a" },
    { type: "received", requestId: "b" },
    { type: "received", requestId: "c" },
    { type: "completed", requestId: "a", ok: true, durationMs: 60000 },
    { type: "completed", requestId: "b", ok: false, code5: "30101", durationMs: 120000 },
    { type: "replayed", requestId: "a", state: "ready" },
    { type: "replayed", requestId: "c", state: "pending" },
    { type: "stale_claim", requestId: "c" },
    { type: "stale_claim", requestId: "c" },
  ];
  const s = ops.buildDeliverySummary(events, []);
  assert.equal(s.received, 3);
  assert.equal(s.completedOk, 1);
  assert.equal(s.completedFailed, 1);
  assert.equal(s.medianMs, 90000);
  assert.deepEqual(s.replays, { ready: 1, pending: 1 });
  assert.equal(s.staleClaims, 1, "a stale claim is counted once per request");
  assert.ok(ops.formatDeliverySummary(s, "test").includes("Stale claims"));
});

test("delivery: phone diagnostics, merged across overlapping uploads", () => {
  const A = "b597966e-8fec-4115-a7fc-22f373aed255";
  const B = "28e785ed-f191-4e54-b52c-00b6610c0f20";
  const C = "68fdbbed-b852-402f-a66a-b9f15092ff13";
  const upload1 = [
    `13:14:17.168 [scan] requestId=${A}`,
    "13:14:19.613 [transport] failed SocketException: Connection reset, following",
    "13:20:16.260 [worker] no result yet, checking back in 60s",
  ];
  const upload2 = [
    ...upload1,
    `13:21:20.940 [scan] requestId=${A}`,
    "13:21:21.244 [worker] server never received the scan, resending",
    "13:21:50.000 [scan] delivered",
    `13:30:00.000 [scan] requestId=${B}`,
    "13:31:00.000 [scan] delivered",
    `13:40:00.000 [scan] requestId=${C}`,
    "13:40:01.000 [worker] expired: no result in 24h",
  ];
  const s = ops.buildDeliverySummary([], [{ lines: upload1 }, { lines: upload2 }]);
  assert.equal(s.client.scansSeen, 3);
  assert.equal(s.client.neverReachedServer, 1);
  assert.equal(s.client.deliveredLater, 1, "A was delivered after a follow-up");
  assert.equal(s.client.deliveredLive, 1, "B was delivered live");
  assert.equal(s.client.expired24h, 1);
  assert.deepEqual(s.client.transportErrors, { "SocketException: Connection reset": 1 });
});

/* 2. Ad gate -------------------------------------------------------- */

test("ad gate: modes, would-reject reasons, tickets, no-fill accounts", () => {
  const events = [
    { type: "gate", mode: "free_verified" },
    { type: "gate", mode: "professional" },
    { type: "gate", mode: "observe_would_reject_60102" },
    { type: "gate", mode: "observe_would_reject_60102" },
    { type: "gate", mode: "observe_would_reject_60101" },
    { type: "completed", mode: "ignored" },
  ];
  const tickets = [
    { consumedAtMs: T0 - 1000, expiresAtMs: T0 + 1 },
    { consumedAtMs: null, expiresAtMs: T0 - 1 },
    { consumedAtMs: null, expiresAtMs: T0 + 60000 },
  ];
  const noFill = [{ uid: "uid-small", claims: 1 }, { uid: "uid-heavy", claims: 9, lastClaimAtMs: T0 }];
  const s = ops.buildAdGateSummary(events, tickets, noFill, T0);
  assert.equal(s.gated, 5);
  assert.deepEqual(s.wouldReject, { 60102: 2, 60101: 1 });
  assert.deepEqual(s.tickets, { verified: 3, used: 1, expired: 1, open: 1 });
  assert.equal(s.noFillAccounts[0].uid, "uid-heavy");
  const text = ops.formatAdGateSummary(s, "test");
  assert.ok(text.includes("[60102] x2"));
  assert.ok(!text.includes("uid-heavy"), "account IDs are shortened");
});

/* 3. Mass failure --------------------------------------------------- */

test("mass failure: a code spiking over its baseline is flagged", () => {
  const completed = [];
  let n = 0;
  const add = (d, ok, code5, charged = true) =>
    completed.push({ type: "completed", requestId: `r${n++}`, atMs: day(d), ok, code5, charged });
  for (let d = 7; d >= 1; d--) { add(d, true, null); add(d, false, "30101"); }
  for (let i = 0; i < 5; i++) add(0, false, "30101");
  add(0, false, "60102", false);
  const s = ops.buildMassFailureSummary(completed, []);
  const today = new Date(T0).toISOString().slice(0, 10);
  assert.equal(s.days[today].chargedFailures, 5, "uncharged failures are not counted");
  assert.equal(s.flags.length, 1);
  assert.equal(s.flags[0].code, "30101");
  assert.equal(s.flags[0].day, today);
});

test("mass failure: receipts backfill, each request counted once", () => {
  const receipts = [
    { requestId: "x", mode: "grounding_rejected", failureCode5: "30102", createdAtMs: day(1) },
    { requestId: "y", mode: "fresh_analysis", createdAtMs: day(1) },
  ];
  const completed = [{ type: "completed", requestId: "x", atMs: day(1), ok: false, code5: "30102", charged: true }];
  const s = ops.buildMassFailureSummary(completed, receipts);
  const d = s.days[new Date(day(1)).toISOString().slice(0, 10)];
  assert.equal(d.chargedFailures, 1);
  assert.deepEqual(d.byCode, { 30102: 1 });
});

/* 4. Refusals ------------------------------------------------------- */

test("refusals: rate by cause against the 5% threshold", () => {
  const receipts = [];
  for (let i = 0; i < 18; i++) receipts.push({ mode: "fresh_analysis", createdAtMs: day(1) });
  receipts.push({ mode: "grounding_rejected", groundingCause: "model_refused", createdAtMs: day(1) });
  receipts.push({ mode: "grounding_rejected", groundingCause: "blink", createdAtMs: day(0) });
  receipts.push({ mode: "exact", createdAtMs: day(0) });
  const s = ops.buildRefusalSummary(receipts);
  assert.equal(s.total.attempts, 20, "cache hits are not research attempts");
  assert.equal(s.rate, 10);
  assert.deepEqual(s.total.byCode, { 30101: 1, 30102: 1 });
  assert.equal(s.aboveThreshold, true);
  assert.ok(ops.formatRefusalSummary(s, "test").includes("Story 10.3"));
});

/* 5. Prepaid -------------------------------------------------------- */

test("prepaid: outstanding banks, sales, usage", () => {
  const s = ops.buildPrepaidSummary({
    entitlements: [
      { id: "u1", topUpScans: 5 },
      { id: "u2", topUpScans: 0 },
      { id: "u3", topUpScans: 7, familyGroupId: "g1" },
    ],
    familyGroups: [{ id: "g1", topUpScans: 20 }],
    dives: [{ creditConsumed: 1 }, { creditConsumed: 1 }],
    revenue: [
      { kind: "topup", outcome: "granted", scansGranted: 10, priceUsd: 4.99 },
      { kind: "topup", outcome: "rejected", scansGranted: 0, priceUsd: 0 },
      { kind: "subscription", outcome: "granted", scansGranted: 30, priceUsd: 12.99 },
    ],
    completed: [{ type: "completed", chargedVia: "topup" }, { type: "completed", chargedVia: "subscription" }],
  });
  assert.equal(s.individualScans, 5, "a family seat's own field is not the bank");
  assert.equal(s.familyScans, 20);
  assert.equal(s.outstanding, 25);
  assert.equal(s.purchasedScans, 10);
  assert.equal(s.usedScans, 3);
  assert.equal(s.usageRate, 30);
});

/* 6a. Research quality ---------------------------------------------- */

test("research quality: grounded vs model-written URLs, score bands", () => {
  const telemetry = {
    groundingVerification: {
      googleSearchQueryCount: 3,
      groundedSourceCount: 2,
      groundingSupportCount: 4,
      sources: [
        { uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc", title: "bbb.org" },
        { uri: "https://www.ftc.gov/news", title: "FTC" },
      ],
    },
  };
  const report = {
    consumer_card: { action_meter_score: 8.7 },
    sources: ["https://www.bbb.org/us/x", "https://ftc.gov/a", "https://made-up.example/claim"],
  };
  const q = researchQuality(report, telemetry);
  assert.equal(q.reportUrls, 3);
  assert.equal(q.groundedReportUrls, 2);
  assert.equal(q.score, 8.7);

  const s = ops.buildResearchQualitySummary([
    { type: "completed", ok: true, quality: q },
    { type: "completed", ok: true, quality: { ...q, score: 4 } },
    { type: "completed", ok: false, quality: q },
  ]);
  assert.equal(s.scans, 2);
  assert.equal(Math.round(s.modelWrittenShare), 33);
  assert.equal(s.bands.find((b) => b.label.startsWith("8.5")).count, 1);
  assert.equal(s.bands.find((b) => b.label.startsWith("8.0")).count, 0);
  assert.equal(s.bands.find((b) => b.label.startsWith("≤5.5")).count, 1);
});

/* 6b. State snapshot ------------------------------------------------ */

test("state: allowlisted settings only, incidents, deploy vs commit", () => {
  const snap = ops.buildStateSnapshot({
    nowMs: T0,
    git: { head: "a7bf1c5", headTime: "2026-10-13T20:00:00Z", dirtyCount: 30 },
    deployed: { revision: "scan-00042", updateTime: "2026-10-14T17:07:00Z" },
    env: { AD_GATE_ENFORCED: "false", PASS1_MODEL: "flash", GEMINI_API_KEY: "secret-value" },
    receipts24h: [{ failureCode5: "30101" }, { failureCode5: "30101" }, { failureCode5: "60102" }],
    refusal: { aboveThreshold: true, rate: 12.34 },
    delivery: { staleClaims: 0, client: { neverReachedServer: 1 } },
    massFailure: { flags: [{ day: "2026-10-14", code: "30101", count: 5 }] },
  });
  const text = JSON.stringify(snap);
  assert.ok(!text.includes("secret-value"), "secrets never leave");
  assert.ok(!("GEMINI_API_KEY" in snap.settings));
  assert.equal(snap.settings.AD_GATE_ENFORCED, "false");
  assert.equal(snap.settings.MAX_GROUNDING_RETRIES, null);
  assert.equal(snap.code.deployedAfterHead, true);
  assert.equal(snap.code.uncommittedFiles, 30);
  assert.equal(snap.topFailureCodes24h[0].code, "30101");
  const kinds = snap.incidents.map((i) => i.kind);
  assert.deepEqual(kinds.sort(), ["failure_spike", "scans_never_reached_server", "search_refusal_above_threshold"]);
});

let passed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    passed++;
    console.log(`  ok: ${name}`);
  } catch (e) {
    console.log(`  FAIL: ${name}\n    ${e.stack.split("\n").slice(0, 3).join("\n    ")}`);
  }
}
console.log(`${passed}/${tests.length} passed`);
process.exitCode = passed === tests.length ? 0 : 1;

/**
 * @file functions/scripts/businessCenterOpsReaders.js
 * @class Class 2 (Standard Data Component)
 * @cap 250 Lines
 * @responsibility Read the Firestore records, git state, and Cloud Run
 *   settings behind the operational Business Center reports, and print
 *   them. Dispatched from business-center.js.
 * @dependencies firebase-admin (db passed in), ../businessCenterOps, git
 *   and gcloud CLIs (state report only).
 * @security_gate Read-only. Never writes Firestore or calls Gemini. The
 *   state report prints only allowlisted settings (STATE_ENV_ALLOWLIST).
 * @owner_context 411 Scanner Business Center operations reporting.
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const ops = require("../businessCenterOps");
const { SCAN_DELIVERY_EVENTS_COLLECTION } = require("../scanDeliveryEvents");
const { REVENUE_EVENTS_COLLECTION } = require("../revenueEvents");
const { buildDeepDiveScopeSummary, formatDeepDiveScopeSummary } = require("../deepDiveScopeReport");
const { buildFloorRaiserSummary, formatFloorRaiserSummary } = require("../floorRaiserReport");
const { buildLedgerHygieneSummary, formatLedgerHygieneSummary } = require("../ledgerHygieneReport");
const { buildReportDoorsSummary, formatReportDoorsSummary } = require("../reportDoorsReport");
const { buildRedTeamSummary, formatRedTeamSummary } = require("../redTeamReport");

const DAY_MS = 24 * 60 * 60 * 1000;

const toMs = (value) =>
  value && typeof value.toMillis === "function" ? value.toMillis() : Number(value) || 0;

/** "today" | "week" | "month" (UTC calendar) or "14d" (trailing days). */
function resolvePeriod(arg, getPeriodStart, fallback) {
  const period = String(arg || fallback).toLowerCase();
  const trailing = /^(\d{1,3})d$/.exec(period);
  if (trailing) {
    const days = Number(trailing[1]);
    return { sinceMs: Date.now() - days * DAY_MS, label: `last ${days} days (UTC)` };
  }
  const start = getPeriodStart(period);
  if (!start) throw new Error("Period must be today, week, month, or Nd (e.g. 14d).");
  return { sinceMs: start.getTime(), label: `${period.toUpperCase()} UTC — since ${start.toISOString()}` };
}

async function byTimestamp(db, admin, collection, field, sinceMs) {
  const snap = await db.collection(collection)
    .where(field, ">=", admin.firestore.Timestamp.fromMillis(sinceMs))
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data(), createdAtMs: toMs(d.data()[field]) }));
}

async function readEvents(db, sinceMs) {
  const snap = await db.collection(SCAN_DELIVERY_EVENTS_COLLECTION).where("atMs", ">=", sinceMs).get();
  return snap.docs.map((d) => d.data());
}

const readReceipts = (db, admin, sinceMs) => byTimestamp(db, admin, "scan_receipts", "createdAt", sinceMs);

async function readAll(db, collection) {
  const snap = await db.collection(collection).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

function gitState() {
  const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
  try {
    return {
      head: git("rev-parse", "--short", "HEAD"),
      headTime: git("log", "-1", "--format=%cI"),
      dirtyCount: git("status", "--porcelain").split("\n").filter(Boolean).length,
    };
  } catch (e) {
    return {};
  }
}

/* The deployed scan service: revision, deploy time, and its env (filtered
 * to the allowlist by buildStateSnapshot before anything is printed). */
function deployedState(projectId) {
  try {
    const raw = execFileSync(
      "gcloud",
      ["run", "services", "describe", "scan", "--region", "us-central1", "--project", projectId, "--format=json"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    );
    const svc = JSON.parse(raw);
    const env = {};
    for (const v of svc?.spec?.template?.spec?.containers?.[0]?.env || []) {
      if (ops.STATE_ENV_ALLOWLIST.includes(v.name)) env[v.name] = v.value ?? null;
    }
    const ready = (svc?.status?.conditions || []).find((c) => c.type === "Ready");
    return {
      deployed: { revision: svc?.status?.latestReadyRevisionName || null, updateTime: ready?.lastTransitionTime || null },
      env,
    };
  } catch (e) {
    return { deployed: {}, env: {} };
  }
}

/**
 * Run one operational report. Returns false when the mode is not one of
 * these, so business-center.js can fall through to its own modes.
 */
async function runOpsReport({ db, admin, projectId, getPeriodStart }, mode, args) {
  if (mode === "delivery") {
    const p = resolvePeriod(args[0], getPeriodStart, "week");
    const [events, diag] = await Promise.all([
      readEvents(db, p.sinceMs),
      byTimestamp(db, admin, "client_diagnostics", "createdAt", p.sinceMs),
    ]);
    console.log(ops.formatDeliverySummary(ops.buildDeliverySummary(events, diag), p.label));
    return true;
  }
  if (mode === "adgate") {
    const p = resolvePeriod(args[0], getPeriodStart, "week");
    const [events, ticketSnap, noFill] = await Promise.all([
      readEvents(db, p.sinceMs),
      db.collection("ad_tickets").where("verifiedAtMs", ">=", p.sinceMs).get(),
      readAll(db, "ad_nofill"),
    ]);
    const tickets = ticketSnap.docs.map((d) => d.data());
    console.log(ops.formatAdGateSummary(
      ops.buildAdGateSummary(events, tickets, noFill.map((n) => ({ uid: n.id, ...n }))),
      p.label
    ));
    return true;
  }
  if (mode === "failures") {
    const p = resolvePeriod(args[0], getPeriodStart, "14d");
    const [events, receipts] = await Promise.all([readEvents(db, p.sinceMs), readReceipts(db, admin, p.sinceMs)]);
    console.log(ops.formatMassFailureSummary(ops.buildMassFailureSummary(events, receipts), p.label));
    return true;
  }
  if (mode === "refusals") {
    const p = resolvePeriod(args[0], getPeriodStart, "7d");
    const receipts = await readReceipts(db, admin, p.sinceMs);
    console.log(ops.formatRefusalSummary(ops.buildRefusalSummary(receipts), p.label));
    return true;
  }
  if (mode === "prepaid") {
    const p = resolvePeriod(args[0], getPeriodStart, "month");
    const [entitlements, familyGroups, dives, revenue, events] = await Promise.all([
      readAll(db, "entitlements"),
      readAll(db, "familyGroups"),
      byTimestamp(db, admin, "deepdive_receipts", "createdAt", p.sinceMs),
      byTimestamp(db, admin, REVENUE_EVENTS_COLLECTION, "createdAt", p.sinceMs),
      readEvents(db, p.sinceMs),
    ]);
    console.log(ops.formatPrepaidSummary(
      ops.buildPrepaidSummary({ entitlements, familyGroups, dives, revenue, completed: events }),
      p.label
    ));
    return true;
  }
  if (mode === "quality") {
    const p = resolvePeriod(args[0], getPeriodStart, "week");
    const events = await readEvents(db, p.sinceMs);
    console.log(ops.formatResearchQualitySummary(ops.buildResearchQualitySummary(events), p.label));
    return true;
  }
  if (mode === "dives") {
    const p = resolvePeriod(args[0], getPeriodStart, "week");
    const [dives, requestSnap] = await Promise.all([
      byTimestamp(db, admin, "deepdive_receipts", "createdAt", p.sinceMs),
      db.collection("deepdive_requests").where("createdAtMs", ">=", p.sinceMs).get(),
    ]);
    const requests = requestSnap.docs.map((d) => d.data());
    console.log(formatDeepDiveScopeSummary(buildDeepDiveScopeSummary(dives, { requests }), p.label));
    return true;
  }
  if (mode === "raisers") {
    const p = resolvePeriod(args[0], getPeriodStart, "week");
    const incidents = await byTimestamp(db, admin, "incidents", "createdAt", p.sinceMs);
    console.log(formatFloorRaiserSummary(buildFloorRaiserSummary(incidents), p.label));
    return true;
  }
  if (mode === "ledger") {
    const p = resolvePeriod(args[0], getPeriodStart, "week");
    const incidents = await byTimestamp(db, admin, "incidents", "createdAt", p.sinceMs);
    console.log(formatLedgerHygieneSummary(buildLedgerHygieneSummary(incidents), p.label));
    return true;
  }
  if (mode === "doors") {
    const p = resolvePeriod(args[0], getPeriodStart, "week");
    const incidents = await byTimestamp(db, admin, "incidents", "createdAt", p.sinceMs);
    console.log(formatReportDoorsSummary(buildReportDoorsSummary(incidents), p.label));
    return true;
  }
  if (mode === "redteam") {
    const p = resolvePeriod(args[0], getPeriodStart, "week");
    const incidents = await byTimestamp(db, admin, "incidents", "createdAt", p.sinceMs);
    console.log(formatRedTeamSummary(buildRedTeamSummary(incidents), p.label));
    return true;
  }
  if (mode === "state") {
    const outIndex = args.indexOf("--out");
    const nowMs = Date.now();
    const [events, receipts14d, diag] = await Promise.all([
      readEvents(db, nowMs - 14 * DAY_MS),
      readReceipts(db, admin, nowMs - 14 * DAY_MS),
      byTimestamp(db, admin, "client_diagnostics", "createdAt", nowMs - DAY_MS),
    ]);
    const lastDay = (list, field) => list.filter((x) => (x[field] || 0) >= nowMs - DAY_MS);
    const { deployed, env } = deployedState(projectId);
    const snapshot = ops.buildStateSnapshot({
      nowMs,
      git: gitState(),
      deployed,
      env,
      receipts24h: lastDay(receipts14d, "createdAtMs"),
      massFailure: ops.buildMassFailureSummary(events, receipts14d),
      refusal: ops.buildRefusalSummary(lastDay(receipts14d, "createdAtMs")),
      delivery: ops.buildDeliverySummary(lastDay(events, "atMs"), diag),
    });
    const json = JSON.stringify(snapshot, null, 2);
    if (outIndex >= 0 && args[outIndex + 1]) {
      const out = path.resolve(args[outIndex + 1]);
      fs.writeFileSync(out, `${json}\n`);
      console.log(`State written to ${out}`);
    } else {
      console.log(json);
    }
    return true;
  }
  return false;
}

module.exports = { runOpsReport, OPS_MODES: ["delivery", "adgate", "failures", "refusals", "prepaid", "quality", "dives", "raisers", "ledger", "doors", "redteam", "state"] };

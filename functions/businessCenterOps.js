/**
 * @file functions/businessCenterOps.js
 * @class Class 3 (Business Reporting Component)
 * @cap 500 Lines
 * @responsibility Operational Business Center reports: scan delivery, ad-gate
 *   readiness, mass-failure detection, search-refusal tracking, prepaid
 *   balances, research quality, and the machine-readable state snapshot
 *   AI sessions read first.
 * @dependencies ./scanErrorCodes
 * @security_gate Read-only math over plain records. Never touches Firestore,
 *   scans, scoring, or entitlements. Account IDs are shortened in output.
 * @owner_context 411 Scanner Business Center (operations side; the money
 *   side is businessCenterReport.js).
 *
 * Inputs are plain objects with millisecond times (the CLI converts
 * Firestore Timestamps): events from scan_delivery_events, receipts from
 * scan_receipts (createdAtMs), and client_diagnostics docs (lines[]).
 */

const { messageFor } = require("./scanErrorCodes");

const DAY_MS = 24 * 60 * 60 * 1000;

const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);
const shortId = (uid) => (uid ? `${String(uid).slice(0, 6)}…` : "unknown");
const pct = (n, d) => (d > 0 ? (100 * n) / d : 0);
const pctText = (value) => `${value.toFixed(1)}%`;

function percentile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

const seconds = (ms) => `${(ms / 1000).toFixed(1)}s`;

function tally(map, key, by = 1) {
  map[key] = (map[key] || 0) + by;
  return map;
}

/* ------------------------------------------------------------------ */
/* Client diagnostics (debug builds only)                              */
/* ------------------------------------------------------------------ */

/**
 * Per-scan facts from client_diagnostics uploads. Each upload carries a
 * rolling buffer, so the same lines repeat across uploads: facts are
 * merged per request ID.
 */
function parseClientDiagnostics(docs = []) {
  const scans = new Map();
  const transportErrors = {};
  const seenTransport = new Set();
  for (const doc of docs) {
    let current = null;
    for (const line of doc.lines || []) {
      const marker = /\[scan\] requestId=([0-9a-f-]{36})/.exec(line);
      if (marker) {
        current = marker[1];
        if (!scans.has(current)) {
          scans.set(current, { resends: 0, followUps: false, delivered: false, deliveredLater: false, expired: false });
        }
        continue;
      }
      if (!current) continue;
      const scan = scans.get(current);
      if (line.includes("server never received the scan, resending")) scan.resends = Math.max(scan.resends, 1);
      if (line.includes("[worker] no result yet")) scan.followUps = true;
      if (line.includes("[scan] delivered")) {
        scan.delivered = true;
        if (scan.followUps) scan.deliveredLater = true;
      }
      if (line.includes("[worker] expired")) scan.expired = true;
      const transport = /\[transport\] failed (.+?), following/.exec(line);
      if (transport && !seenTransport.has(`${current}|${line}`)) {
        seenTransport.add(`${current}|${line}`);
        tally(transportErrors, transport[1]);
      }
    }
  }
  return { scans, transportErrors };
}

/* ------------------------------------------------------------------ */
/* 1. Scan delivery                                                    */
/* ------------------------------------------------------------------ */

function buildDeliverySummary(events = [], diagnosticsDocs = []) {
  const received = new Set();
  const replays = {};
  const stale = new Set();
  const durations = [];
  let completedOk = 0;
  let completedFailed = 0;
  for (const e of events) {
    if (e.type === "received") received.add(e.requestId);
    if (e.type === "replayed") tally(replays, e.state || "unknown");
    if (e.type === "stale_claim") stale.add(e.requestId);
    if (e.type === "completed") {
      if (e.ok) completedOk++;
      else completedFailed++;
      if (Number.isFinite(e.durationMs)) durations.push(e.durationMs);
    }
  }
  const client = parseClientDiagnostics(diagnosticsDocs);
  const clientScans = [...client.scans.values()];
  const delivered = clientScans.filter((s) => s.delivered);
  return {
    received: received.size,
    completedOk,
    completedFailed,
    medianMs: percentile(durations, 0.5),
    p95Ms: percentile(durations, 0.95),
    replays,
    staleClaims: stale.size,
    client: {
      scansSeen: clientScans.length,
      neverReachedServer: clientScans.filter((s) => s.resends > 0).length,
      deliveredLive: delivered.filter((s) => !s.deliveredLater).length,
      deliveredLater: delivered.filter((s) => s.deliveredLater).length,
      expired24h: clientScans.filter((s) => s.expired).length,
      transportErrors: client.transportErrors,
    },
  };
}

function formatDeliverySummary(s, label) {
  const replayLine = Object.keys(s.replays).length
    ? Object.entries(s.replays).map(([k, v]) => `${k} x${v}`).join(", ")
    : "none";
  const transport = Object.entries(s.client.transportErrors)
    .sort((a, b) => b[1] - a[1])
    .map(([msg, n]) => `    ${msg} x${n}`);
  return [
    "═══ SCAN DELIVERY ═══",
    `Period: ${label}`,
    "Server side:",
    `  Received: ${s.received}`,
    `  Completed: ${s.completedOk} delivered, ${s.completedFailed} failed`,
    `  Server time to outcome: median ${seconds(s.medianMs)}, slowest 5% ${seconds(s.p95Ms)}`,
    `  Resends that found the scan already here: ${replayLine}`,
    `  Stale claims (scan died without an outcome): ${s.staleClaims}`,
    "Phone side (debug-build diagnostics only):",
    `  Scans seen: ${s.client.scansSeen}`,
    `  Never reached the server (resent): ${s.client.neverReachedServer}`,
    `  Delivered while the scan was live: ${s.client.deliveredLive}`,
    `  Delivered later by follow-up (user likely away; notification): ${s.client.deliveredLater}`,
    `  Expired after 24h: ${s.client.expired24h}`,
    "  Connection failures by error:",
    ...(transport.length ? transport : ["    none"]),
    "  Note: \"live\" vs \"later\" is a proxy for app-open vs notification;",
    "  the exact split needs one app event (not built: no app changes).",
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/* 2. Ad-gate readiness                                                */
/* ------------------------------------------------------------------ */

function buildAdGateSummary(gateEvents = [], tickets = [], noFill = [], nowMs = Date.now()) {
  const byMode = {};
  const wouldReject = {};
  for (const e of gateEvents) {
    if (e.type !== "gate") continue;
    tally(byMode, e.mode || "unknown");
    const m = /^observe_would_reject_(\d{5})$/.exec(e.mode || "");
    if (m) tally(wouldReject, m[1]);
  }
  let used = 0;
  let expired = 0;
  let open = 0;
  for (const t of tickets) {
    if (t.consumedAtMs) used++;
    else if (Number(t.expiresAtMs) < nowMs) expired++;
    else open++;
  }
  const noFillAccounts = noFill
    .map((n) => ({ uid: n.uid, claims: Number(n.claims) || 0, lastClaimAtMs: n.lastClaimAtMs || null }))
    .sort((a, b) => b.claims - a.claims);
  return {
    gated: Object.values(byMode).reduce((a, b) => a + b, 0),
    byMode,
    wouldReject,
    tickets: { verified: tickets.length, used, expired, open },
    noFillAccounts,
  };
}

function formatAdGateSummary(s, label) {
  const modes = Object.entries(s.byMode).sort((a, b) => b[1] - a[1]).map(([m, n]) => `  ${m}: ${n}`);
  const rejects = Object.entries(s.wouldReject).map(
    ([code, n]) => `  [${code}] x${n}: ${messageFor(code)}`
  );
  const noFill = s.noFillAccounts.slice(0, 10).map(
    (a) => `  ${shortId(a.uid)}: ${a.claims} no-ad scans` +
      (a.lastClaimAtMs ? `, last ${new Date(a.lastClaimAtMs).toISOString()}` : "")
  );
  return [
    "═══ AD GATE READINESS ═══",
    `Period: ${label}`,
    `Scans through the gate: ${s.gated}`,
    ...(modes.length ? modes : ["  none recorded"]),
    "Would be rejected once enforcement is on:",
    ...(rejects.length ? rejects : ["  none"]),
    "Ad tickets (Google-verified rewards):",
    `  Verified ${s.tickets.verified} | used ${s.tickets.used} | expired unused ${s.tickets.expired} | open ${s.tickets.open}`,
    "Subscriber scans with no ad available (all time, top 10):",
    ...(noFill.length ? noFill : ["  none"]),
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/* 3. Mass-failure detector                                            */
/* ------------------------------------------------------------------ */

/**
 * Charged failures by code per day. A day is flagged when a code has at
 * least minCount charged failures and at least `factor` times its
 * trailing 7-day daily average (an absent baseline counts as 1/day).
 * Grounding-rejected receipts are always charged and backfill the days
 * before completion events existed; request IDs are counted once.
 */
function buildMassFailureSummary(completed = [], receipts = [], { minCount = 3, factor = 2 } = {}) {
  const seen = new Set();
  const rows = [];
  for (const e of completed) {
    if (e.type !== "completed" || seen.has(e.requestId)) continue;
    seen.add(e.requestId);
    rows.push({ day: dayKey(e.atMs), charged: !!e.charged, ok: !!e.ok, code5: e.code5 });
  }
  for (const r of receipts) {
    if (r.mode !== "grounding_rejected" || seen.has(r.requestId)) continue;
    seen.add(r.requestId);
    rows.push({ day: dayKey(r.createdAtMs), charged: true, ok: false, code5: r.failureCode5 || "30101" });
  }
  const days = {};
  for (const row of rows) {
    const d = (days[row.day] ||= { charged: 0, chargedFailures: 0, byCode: {} });
    if (!row.charged) continue;
    d.charged++;
    if (!row.ok) {
      d.chargedFailures++;
      tally(d.byCode, row.code5 || "90101");
    }
  }
  const order = Object.keys(days).sort();
  const flags = [];
  order.forEach((day, i) => {
    const prior = order.slice(Math.max(0, i - 7), i);
    for (const [code, count] of Object.entries(days[day].byCode)) {
      const baseline = prior.length
        ? prior.reduce((sum, p) => sum + (days[p].byCode[code] || 0), 0) / prior.length
        : 0;
      if (count >= minCount && count >= factor * Math.max(baseline, 1)) {
        flags.push({ day, code, count, baseline });
      }
    }
  });
  return { days, order, flags };
}

function formatMassFailureSummary(s, label) {
  const lines = s.order.map((day) => {
    const d = s.days[day];
    const codes = Object.entries(d.byCode).map(([c, n]) => `${c} x${n}`).join(", ") || "none";
    return `  ${day}: ${d.chargedFailures}/${d.charged} charged attempts failed (${pctText(pct(d.chargedFailures, d.charged))}) — ${codes}`;
  });
  const flags = s.flags.map(
    (f) => `  ⚠ ${f.day} [${f.code}] x${f.count} vs ~${f.baseline.toFixed(1)}/day: ${messageFor(f.code)}`
  );
  return [
    "═══ MASS-FAILURE DETECTOR ═══",
    `Period: ${label}`,
    "Charged failures by day:",
    ...(lines.length ? lines : ["  no charged attempts"]),
    "Spikes (billing policy: refund or extend credit when a failure hits at scale):",
    ...(flags.length ? flags : ["  none"]),
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/* 4. Search-refusal tracker (Epic 10.2)                               */
/* ------------------------------------------------------------------ */

const REFUSAL_BASELINES = { historical: 41, preFix: 21 };
const REFUSAL_THRESHOLD = 5;

const causeCode = (cause) =>
  cause === "model_refused" ? "30101" : cause === "blink" ? "30102" : "30103";

/**
 * Research attempts (fresh, stale refresh, grounding rejected) per day and
 * how many ended rejected, by cause. The rate is final rejections over
 * research attempts; retries inside one scan are not counted separately.
 */
function buildRefusalSummary(receipts = []) {
  const days = {};
  const total = { attempts: 0, rejected: 0, byCode: {} };
  for (const r of receipts) {
    if (!["fresh_analysis", "stale_refresh", "grounding_rejected"].includes(r.mode)) continue;
    const d = (days[dayKey(r.createdAtMs)] ||= { attempts: 0, rejected: 0, byCode: {} });
    d.attempts++;
    total.attempts++;
    if (r.mode === "grounding_rejected") {
      const code = causeCode(r.groundingCause);
      d.rejected++;
      total.rejected++;
      tally(d.byCode, code);
      tally(total.byCode, code);
    }
  }
  const rate = pct(total.rejected, total.attempts);
  return {
    days,
    order: Object.keys(days).sort(),
    total,
    rate,
    aboveThreshold: rate > REFUSAL_THRESHOLD,
  };
}

function formatRefusalSummary(s, label) {
  const codes = (byCode) =>
    ["30101", "30102", "30103"].map((c) => `${c} ${byCode[c] || 0}`).join(" / ");
  const lines = s.order.map((day) => {
    const d = s.days[day];
    return `  ${day}: ${pctText(pct(d.rejected, d.attempts))} of ${d.attempts} research attempts — ${codes(d.byCode)}`;
  });
  return [
    "═══ SEARCH-REFUSAL TRACKER (Epic 10.2) ═══",
    `Period: ${label}`,
    ...(lines.length ? lines : ["  no research attempts"]),
    `Period rate: ${pctText(s.rate)} (${s.total.rejected}/${s.total.attempts}) — ${codes(s.total.byCode)}`,
    `Baselines: ${REFUSAL_BASELINES.historical}% historical, ${REFUSAL_BASELINES.preFix}% in the 3 days before the fix`,
    `Threshold ${REFUSAL_THRESHOLD}%: ${s.aboveThreshold ? "ABOVE — Story 10.3 (Pass-1 split) is triggered" : "at or below — the fix holds"}`,
    "30101 no search ran · 30102 search found nothing · 30103 other",
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/* 5. Prepaid balances                                                 */
/* ------------------------------------------------------------------ */

function buildPrepaidSummary({ entitlements = [], familyGroups = [], dives = [], revenue = [], completed = [] } = {}) {
  const individuals = entitlements.filter((e) => !e.familyGroupId && (Number(e.topUpScans) || 0) > 0);
  const families = familyGroups.filter((g) => (Number(g.topUpScans) || 0) > 0);
  const sumOf = (list) => list.reduce((a, x) => a + (Number(x.topUpScans) || 0), 0);
  const topUpPurchases = revenue.filter((r) => r.kind === "topup" && r.outcome === "granted");
  const purchasedScans = topUpPurchases.reduce((a, r) => a + (Number(r.scansGranted) || 0), 0);
  const purchasedUsd = topUpPurchases.reduce((a, r) => a + (Number(r.priceUsd) || 0), 0);
  const diveCredits = dives.reduce((a, d) => a + (Number(d.creditConsumed) || 0), 0);
  const scanDraws = completed.filter((e) => e.type === "completed" && e.chargedVia === "topup").length;
  const outstanding = sumOf(individuals) + sumOf(families);
  return {
    individualAccounts: individuals.length,
    individualScans: sumOf(individuals),
    familyBanks: families.map((g) => ({ id: g.id, scans: Number(g.topUpScans) || 0 })),
    familyScans: sumOf(families),
    outstanding,
    purchasedScans,
    purchasedUsd,
    usedScans: diveCredits + scanDraws,
    diveCredits,
    scanDraws,
    usageRate: pct(diveCredits + scanDraws, purchasedScans),
    avgUsdPerScan: purchasedScans > 0 ? purchasedUsd / purchasedScans : null,
  };
}

function formatPrepaidSummary(s, label) {
  const liability = s.avgUsdPerScan == null
    ? "n/a (no top-up sales in period)"
    : `~$${(s.outstanding * s.avgUsdPerScan).toFixed(2)} at this period's $${s.avgUsdPerScan.toFixed(2)}/scan`;
  return [
    "═══ PREPAID BALANCES ═══",
    `Period: ${label}`,
    "Unused top-up scans (prepaid, work not yet done) — current:",
    `  Individual accounts: ${s.individualScans} scans across ${s.individualAccounts} accounts`,
    `  Family banks: ${s.familyScans} scans across ${s.familyBanks.length} groups`,
    `  Outstanding: ${s.outstanding} scans — ${liability}`,
    "This period:",
    `  Top-up scans sold: ${s.purchasedScans} ($${s.purchasedUsd.toFixed(2)})`,
    `  Top-up scans used: ${s.usedScans} (Deep Dive credits ${s.diveCredits}, scans drawn from top-ups ${s.scanDraws})`,
    `  Usage rate: ${pctText(s.usageRate)} of what was sold`,
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/* 6a. Research quality                                                */
/* ------------------------------------------------------------------ */

// Score surface (≤5.5 contacts, 5.6+ fog light) and the unified action ladder.
const SCORE_BANDS = [
  { label: "≤5.5 verified contacts", test: (x) => x <= 5.5 },
  { label: "5.6–6.9 fog light", test: (x) => x > 5.5 && x < 7 },
  { label: "7.0–7.9 professional consideration only", test: (x) => x >= 7 && x < 8 },
  { label: "8.0–8.4 delete from device", test: (x) => x >= 8 && x < 8.5 },
  { label: "8.5–8.9 delete from device and report", test: (x) => x >= 8.5 && x < 9 },
  { label: "9.0–9.9 report to platform", test: (x) => x >= 9 && x < 10 },
  { label: "10 delete from earth", test: (x) => x >= 10 },
];

function buildResearchQualitySummary(completed = []) {
  const q = completed.filter((e) => e.type === "completed" && e.ok && e.quality).map((e) => e.quality);
  const urls = q.reduce((a, x) => a + (x.reportUrls || 0), 0);
  const grounded = q.reduce((a, x) => a + (x.groundedReportUrls || 0), 0);
  const scores = q.map((x) => x.score).filter((x) => Number.isFinite(x));
  return {
    scans: q.length,
    medianSearchQueries: percentile(q.map((x) => x.searchQueries || 0), 0.5),
    medianGroundedSources: percentile(q.map((x) => x.groundedSources || 0), 0.5),
    noSupports: q.filter((x) => !x.groundingSupports).length,
    reportUrls: urls,
    groundedReportUrls: grounded,
    modelWrittenShare: pct(urls - grounded, urls),
    bands: SCORE_BANDS.map((b) => ({ label: b.label, count: scores.filter(b.test).length })),
  };
}

function formatResearchQualitySummary(s, label) {
  return [
    "═══ RESEARCH QUALITY ═══",
    `Period: ${label}`,
    `Fresh scans measured: ${s.scans}`,
    `  Median searches per scan: ${s.medianSearchQueries}`,
    `  Median grounded sources per scan: ${s.medianGroundedSources}`,
    `  Scans with no grounding supports: ${s.noSupports}`,
    `  URLs in reports: ${s.reportUrls} — ${s.groundedReportUrls} trace to a grounded source, ` +
      `${pctText(s.modelWrittenShare)} model-written (Epic 9)`,
    "Score distribution:",
    ...s.bands.map((b) => `  ${b.label}: ${b.count}`),
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/* 6b. State snapshot for AI sessions                                  */
/* ------------------------------------------------------------------ */

// Settings an AI may see. Anything else (keys, secrets) never leaves.
const STATE_ENV_ALLOWLIST = ["AD_GATE_ENFORCED", "PASS1_MODEL", "PASS2_MODEL", "MAX_GROUNDING_RETRIES"];

function buildStateSnapshot({ nowMs = Date.now(), git = {}, deployed = {}, env = {}, receipts24h = [], massFailure, refusal, delivery } = {}) {
  const settings = {};
  for (const key of STATE_ENV_ALLOWLIST) settings[key] = key in env ? env[key] : null;
  const codes = {};
  for (const r of receipts24h) if (r.failureCode5) tally(codes, r.failureCode5);
  const today = dayKey(nowMs);
  const incidents = [];
  for (const f of massFailure?.flags || []) {
    if (nowMs - Date.parse(`${f.day}T00:00:00Z`) <= 2 * DAY_MS) {
      incidents.push({ kind: "failure_spike", day: f.day, code: f.code, count: f.count });
    }
  }
  if (refusal?.aboveThreshold) {
    incidents.push({ kind: "search_refusal_above_threshold", ratePct: Number(refusal.rate.toFixed(1)) });
  }
  if (delivery?.staleClaims) incidents.push({ kind: "stale_claims", count: delivery.staleClaims });
  if (delivery?.client?.neverReachedServer) {
    incidents.push({ kind: "scans_never_reached_server", count: delivery.client.neverReachedServer });
  }
  const deployedMs = Date.parse(deployed.updateTime || "") || null;
  const committedMs = Date.parse(git.headTime || "") || null;
  return {
    generatedAt: new Date(nowMs).toISOString(),
    day: today,
    code: {
      headCommit: git.head || null,
      headTime: git.headTime || null,
      uncommittedFiles: git.dirtyCount ?? null,
      deployedRevision: deployed.revision || null,
      deployedAt: deployed.updateTime || null,
      deployedAfterHead: deployedMs && committedMs ? deployedMs > committedMs : null,
      note: "A deploy after the head commit with uncommitted files means production may run uncommitted code.",
    },
    settings,
    topFailureCodes24h: Object.entries(codes)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([code, count]) => ({ code, count, message: messageFor(code) })),
    incidents,
  };
}

module.exports = {
  parseClientDiagnostics,
  buildDeliverySummary,
  formatDeliverySummary,
  buildAdGateSummary,
  formatAdGateSummary,
  buildMassFailureSummary,
  formatMassFailureSummary,
  buildRefusalSummary,
  formatRefusalSummary,
  REFUSAL_THRESHOLD,
  buildPrepaidSummary,
  formatPrepaidSummary,
  buildResearchQualitySummary,
  formatResearchQualitySummary,
  buildStateSnapshot,
  STATE_ENV_ALLOWLIST,
};

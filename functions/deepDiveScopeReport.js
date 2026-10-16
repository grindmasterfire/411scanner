/**
 * @file functions/deepDiveScopeReport.js
 * @class Class 3 (Business Reporting Component)
 * @cap 200 Lines
 * @responsibility Business Center "dives" report: what each Deep Dive
 *   investigated (finding, auto or client pick), which mode routed it, and
 *   any dive that broke the scope rules.
 * @dependencies none
 * @security_gate Read-only math over deepdive_receipts records. Account IDs
 *   never printed.
 * @owner_context 411 Scanner Deep Dive scope fix (fire 2026-10-16):
 *   one finding per dive; pattern mode only for an unnameable operator on
 *   a score of 8.0 or more.
 */

const PATTERN_MIN_SCORE = 8.0;

const toMs = (v) =>
  v && typeof v.toMillis === "function" ? v.toMillis()
    : v instanceof Date ? v.getTime()
      : Number(v) || 0;

function tally(map, key) {
  map[key] = (map[key] || 0) + 1;
}

/**
 * Violations are only judged on dives made under the scope fix
 * (deepDiveStandard >= 3); older receipts are counted as legacy.
 */
/**
 * Background requests (deepdive_requests): how many finished, failed, are
 * still running, and how many are stuck "running" past 10 minutes.
 */
function summarizeRequests(requests = [], nowMs = Date.now()) {
  const out = { total: requests.length, done: 0, failed: 0, running: 0, stuck: [] };
  for (const r of requests) {
    if (r.status === "done") out.done++;
    else if (r.status === "failed") out.failed++;
    else if (nowMs - (r.createdAtMs || 0) > 10 * 60 * 1000) out.stuck.push(r.requestId);
    else out.running++;
  }
  return out;
}

function buildDeepDiveScopeSummary(receipts = [], { recent = 15, requests = null, nowMs = Date.now() } = {}) {
  const s = {
    total: receipts.length,
    legacy: 0,
    cacheHits: 0,
    failed: 0,
    byMode: {},
    bySource: {},
    byFindingKind: {},
    searches: 0,
    violations: [],
    recent: [],
    requests: requests ? summarizeRequests(requests, nowMs) : null,
  };

  const sorted = [...receipts].sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));
  for (const r of sorted) {
    if (r.cacheHit) s.cacheHits++;
    if (r.failureCode5) s.failed++;
    s.searches += Number(r.googleSearchQueries) || 0;

    if (!(Number(r.deepDiveStandard) >= 3)) {
      s.legacy++;
      continue;
    }

    const mode = r.patternMode ? "pattern" : "narrow";
    tally(s.byMode, mode);
    tally(s.bySource, r.findingSource || "none");
    tally(s.byFindingKind, String(r.findingId || "none").split("_")[0]);

    const score = r.baseScore === null || r.baseScore === undefined ? null : Number(r.baseScore);
    if (r.patternMode && !(Number.isFinite(score) && score >= PATTERN_MIN_SCORE)) {
      s.violations.push({ requestId: r.requestId, rule: `pattern dive on score ${score ?? "none"} (needs ${PATTERN_MIN_SCORE}+)` });
    }
    const confidence = String(r.identityConfidence || "").toLowerCase();
    if (r.patternMode && ["confirmed", "high"].includes(confidence)) {
      s.violations.push({ requestId: r.requestId, rule: `pattern dive on a ${confidence} operator (${r.operator || "?"})` });
    }
    if (!r.patternMode && !(r.findingId && r.findingText)) {
      s.violations.push({ requestId: r.requestId, rule: "narrow dive with no finding (whole-target dive)" });
    }

    if (s.recent.length < recent) {
      s.recent.push({
        requestId: r.requestId,
        atMs: toMs(r.createdAt),
        targetName: r.targetName || "?",
        mode,
        baseScore: score,
        findingId: r.findingId || null,
        findingSource: r.findingSource || null,
        findingText: r.findingText || "",
        cacheHit: !!r.cacheHit,
        searches: Number(r.googleSearchQueries) || 0,
        failureCode5: r.failureCode5 || null,
      });
    }
  }
  return s;
}

function formatCounts(map) {
  const parts = Object.entries(map).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`);
  return parts.length ? parts.join(" · ") : "none";
}

function formatDeepDiveScopeSummary(s, label) {
  const lines = [
    `DEEP DIVES — ${label}`,
    "",
    `Dives: ${s.total} (cache hits ${s.cacheHits}, failed ${s.failed}, before the scope fix ${s.legacy})`,
    `Mode: ${formatCounts(s.byMode)}`,
    `Finding picked by: ${formatCounts(s.bySource)}`,
    `Finding kind: ${formatCounts(s.byFindingKind)}`,
    `Google searches: ${s.searches}`,
    ...(s.requests
      ? [`Background requests: ${s.requests.total} (done ${s.requests.done}, failed ${s.requests.failed}, running ${s.requests.running})` +
          (s.requests.stuck.length ? ` — STUCK: ${s.requests.stuck.join(", ")}` : "")]
      : []),
    "",
    s.violations.length
      ? `SCOPE VIOLATIONS: ${s.violations.length}`
      : "Scope violations: 0",
    ...s.violations.map((v) => `  ${v.requestId}  ${v.rule}`),
  ];
  if (s.recent.length) {
    lines.push("", "Recent dives (scope fix onward):");
    for (const d of s.recent) {
      const when = d.atMs ? new Date(d.atMs).toISOString().slice(0, 16).replace("T", " ") : "?";
      const flags = [d.cacheHit ? "cache" : `${d.searches} searches`, d.failureCode5 ? `FAILED ${d.failureCode5}` : null]
        .filter(Boolean).join(", ");
      lines.push(
        `  ${when}  ${d.requestId}  ${d.targetName}  [${d.mode}, score ${d.baseScore ?? "?"}, ${flags}]`,
        `      ${d.findingSource || "?"}: ${d.findingId || "?"} — ${d.findingText.slice(0, 140) || "(pattern)"}`
      );
    }
  }
  return lines.join("\n");
}

module.exports = {
  buildDeepDiveScopeSummary,
  formatDeepDiveScopeSummary,
};

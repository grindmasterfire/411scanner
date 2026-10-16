/**
 * @file functions/ledgerHygieneReport.js
 * @class Class 3 (Business Reporting Component)
 * @cap 100 Lines
 * @responsibility Business Center "ledger" report: how each scan's network
 *   probe went (measured, fallback, skipped as an impersonated brand…) and
 *   which ledger values arrived as status codes and were scrubbed.
 * @dependencies none
 * @security_gate Read-only math over incidents records. No account IDs.
 * @owner_context fire 2026-10-16 (UAC 4u): "searched_redacted" shipped as
 *   the registration dates; the real domain was never probed.
 */

const toMs = (v) => (v && typeof v.toMillis === "function" ? v.toMillis() : Number(v) || 0);

// Probe outcomes where the report's own domain went unmeasured.
const UNMEASURED = new Set(["impersonated_brand_not_probed", "fallback_unmeasured", "bypassed_no_target", "unrelated_probe_discarded"]);

function buildLedgerHygieneSummary(incidents = []) {
  const s = { scans: 0, byProbe: {}, unmeasured: [], scrubbed: [] };
  const sorted = [...incidents].sort((a, b) => (b.createdAtMs || toMs(b.createdAt)) - (a.createdAtMs || toMs(a.createdAt)));
  for (const inc of sorted) {
    if (inc.kind && inc.kind !== "scan") continue;
    if (inc.failureCode5) continue;
    s.scans++;
    const status = inc.probeStatus || "not_recorded";
    s.byProbe[status] = (s.byProbe[status] || 0) + 1;
    const row = { requestId: inc.requestId, target: inc.target || "?", probeStatus: status, fields: inc.ledgerScrubbed || [] };
    if (UNMEASURED.has(status)) s.unmeasured.push(row);
    if (row.fields.length) s.scrubbed.push(row);
  }
  return s;
}

function formatLedgerHygieneSummary(s, label) {
  const counts = Object.entries(s.byProbe).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`);
  return [
    `LEDGER HYGIENE — ${label}`,
    "",
    `Scans: ${s.scans}`,
    `Network probe: ${counts.length ? counts.join(" · ") : "none"}`,
    "",
    s.scrubbed.length
      ? `STATUS CODES SCRUBBED FROM VALUES: ${s.scrubbed.length} scan(s) — the model wrote a code where a fact belongs`
      : "Status codes scrubbed from values: 0",
    ...s.scrubbed.map((r) => `  ${r.requestId}  ${r.target}  [${r.probeStatus}]  ${r.fields.join(", ")}`),
    "",
    s.unmeasured.length
      ? `OWN DOMAIN NOT MEASURED: ${s.unmeasured.length} scan(s) — review the probe outcome`
      : "Own domain not measured: 0",
    ...s.unmeasured.map((r) => `  ${r.requestId}  ${r.target}  [${r.probeStatus}]`),
  ].join("\n");
}

module.exports = { buildLedgerHygieneSummary, formatLedgerHygieneSummary };

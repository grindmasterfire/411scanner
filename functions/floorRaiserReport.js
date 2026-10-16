/**
 * @file functions/floorRaiserReport.js
 * @class Class 3 (Business Reporting Component)
 * @cap 150 Lines
 * @responsibility Business Center "raisers" report: which floor raisers the
 *   server accepted on scans in a period, on what evidence, and any
 *   rebrand_pattern firing whose evidence doesn't describe a name change.
 * @dependencies none
 * @security_gate Read-only math over incidents records. Account IDs never
 *   printed.
 * @owner_context Rebrand rule tightened 2026-10-16 (UAC 4u: concurrent trade
 *   names scored as a rebrand, +1.0). A rebrand is a CHANGE of name after
 *   complaints, enforcement, a bad rating, a lawsuit, or a shutdown.
 */

const { CHANGE_WORDING, describesNameChange } = require("./rebrandEvidence");

const toMs = (v) =>
  v && typeof v.toMillis === "function" ? v.toMillis()
    : v instanceof Date ? v.getTime()
      : Number(v) || 0;

function buildFloorRaiserSummary(incidents = []) {
  const s = { scans: 0, withRaisers: 0, byRaiser: {}, firings: [], rebrandChecks: [], watchlist: [] };
  const sorted = [...incidents].sort((a, b) => (b.createdAtMs || toMs(b.createdAt)) - (a.createdAtMs || toMs(a.createdAt)));
  for (const inc of sorted) {
    if (inc.kind && inc.kind !== "scan") continue;
    s.scans++;
    const infra = inc.infrastructure || {};
    if (infra.watch && (infra.watch.seen || []).length) {
      s.watchlist.push({
        requestId: inc.requestId,
        target: inc.target || "?",
        entity: infra.entity || "?",
        score: inc.score ?? null,
        retriggered: infra.watch.retriggered || [],
        seen: infra.watch.seen,
        evidence: infra.watch.evidence || {},
      });
    }
    const raisers = inc.floorRaisers || {};
    const names = Object.keys(raisers);
    if (names.length) s.withRaisers++;
    for (const name of names) {
      s.byRaiser[name] = (s.byRaiser[name] || 0) + 1;
      const firing = {
        requestId: inc.requestId,
        atMs: inc.createdAtMs || toMs(inc.createdAt),
        target: inc.target || "?",
        score: inc.score ?? null,
        raiser: name,
        evidence: String(raisers[name] || ""),
      };
      s.firings.push(firing);
      if (name === "rebrand_pattern" && !describesNameChange([firing.evidence])) {
        s.rebrandChecks.push(firing);
      }
    }
  }
  return s;
}

function formatFloorRaiserSummary(s, label) {
  const counts = Object.entries(s.byRaiser).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`);
  const lines = [
    `FLOOR RAISERS — ${label}`,
    "",
    `Scans: ${s.scans} (with an accepted floor raiser: ${s.withRaisers})`,
    `Accepted: ${counts.length ? counts.join(" · ") : "none"}`,
    "",
    s.rebrandChecks.length
      ? `REBRAND CHECK: ${s.rebrandChecks.length} rebrand_pattern firing(s) with no name-change wording — review`
      : "Rebrand check: 0",
    ...s.rebrandChecks.map((f) => `  ${f.requestId}  ${f.target} (${f.score ?? "?"})`),
    "",
    s.watchlist.some((w) => w.retriggered.length)
      ? `WATCHLIST RE-TRIGGERED: ${s.watchlist.filter((w) => w.retriggered.length).length} — adjudicated impersonation; the evaluated score shows`
      : `Watchlist: ${s.watchlist.length} scan(s) saw impersonation evidence on a watchlisted entity, held as history (0 re-triggered)`,
    ...s.watchlist.flatMap((w) => [
      `  ${w.requestId}  ${w.entity}  score ${w.score ?? "?"}  ${w.retriggered.length ? `RE-TRIGGERED ${w.retriggered.join(", ")}` : `held: ${w.seen.join(", ")}`}`,
      ...Object.values(w.evidence).map((e) => `      ${String(e).slice(0, 240)}`),
    ]),
  ];
  if (s.firings.length) {
    lines.push("", "Firings (newest first):");
    for (const f of s.firings) {
      const when = f.atMs ? new Date(f.atMs).toISOString().slice(0, 16).replace("T", " ") : "?";
      lines.push(`  ${when}  ${f.requestId}  ${f.target}  score ${f.score ?? "?"}  ${f.raiser}`,
        `      ${f.evidence.slice(0, 300) || "(no evidence text)"}`);
    }
  }
  return lines.join("\n");
}

module.exports = {
  CHANGE_WORDING,
  buildFloorRaiserSummary,
  formatFloorRaiserSummary,
};

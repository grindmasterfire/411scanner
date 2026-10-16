/**
 * @file functions/reportDoorsReport.js
 * @class Class 3 (Business Reporting Component)
 * @cap 80 Lines
 * @responsibility Business Center "doors" report: which reporting doors the
 *   Report button offered (scans at 8.5+), how often, and any reportable
 *   scan that offered only the FTC (a routing gap to review).
 * @dependencies none
 * @security_gate Read-only math over incidents records. No account IDs.
 * @owner_context fire 2026-10-16: the Report button routes by violation type.
 */

const REPORTABLE = 8.5;

function buildReportDoorsSummary(incidents = []) {
  const s = { reportable: 0, byDoor: {}, ftcOnly: [] };
  for (const inc of incidents) {
    if (inc.kind && inc.kind !== "scan") continue;
    if (!(Number(inc.score) >= REPORTABLE)) continue;
    s.reportable++;
    const doors = inc.reportDoors || [];
    for (const d of doors) s.byDoor[d] = (s.byDoor[d] || 0) + 1;
    if (doors.length <= 1) s.ftcOnly.push({ requestId: inc.requestId, target: inc.target || "?", score: inc.score });
  }
  return s;
}

function formatReportDoorsSummary(s, label) {
  const counts = Object.entries(s.byDoor).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`);
  return [
    `REPORT DOORS — ${label}`,
    "",
    `Reportable scans (8.5+): ${s.reportable}`,
    `Doors offered: ${counts.length ? counts.join(" · ") : "none"}`,
    "",
    s.ftcOnly.length
      ? `FTC ONLY: ${s.ftcOnly.length} reportable scan(s) got no specific door — review the mapping`
      : "FTC only: 0",
    ...s.ftcOnly.map((r) => `  ${r.requestId}  ${r.target} (${r.score})`),
  ].join("\n");
}

module.exports = { buildReportDoorsSummary, formatReportDoorsSummary };

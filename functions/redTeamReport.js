/**
 * @file functions/redTeamReport.js
 * @class Class 3 (Business Reporting Component)
 * @cap 80 Lines
 * @responsibility Business Center "redteam" report: attacks seen (pure vs
 *   hybrid), screenshot text flagged as aimed at the scanner, attack floors
 *   applied, and Honest Business Model caps for false regulatory claims.
 * @dependencies none
 * @security_gate Read-only math over incidents records. No account IDs.
 * @owner_context Red-team fixes #2, #3, #4, #7 (2026-10-16).
 */

function buildRedTeamSummary(incidents = []) {
  const s = { scans: 0, pure: [], hybrid: [], flagged: [], floors: [], caps: [] };
  for (const inc of incidents) {
    if (inc.kind && inc.kind !== "scan") continue;
    s.scans++;
    const row = { requestId: inc.requestId, target: inc.target || "?", score: inc.score ?? null };
    if (inc.attackView === "pure") s.pure.push(row);
    if (inc.attackView === "hybrid") s.hybrid.push(row);
    if (inc.injectionFlag) s.flagged.push({ ...row, hits: [...(inc.injectionFlag.instructionLike || []), inc.injectionFlag.fakeVerified].filter(Boolean) });
    if (inc.attackFloor) s.floors.push(row);
    if (inc.regulatoryClaimCap) s.caps.push({ ...row, claim: inc.regulatoryClaimCap });
  }
  return s;
}

function formatRedTeamSummary(s, label) {
  const list = (rows, extra = () => "") => rows.map((r) => `  ${r.requestId}  ${r.target} (${r.score ?? "?"})${extra(r)}`);
  return [
    `RED TEAM — ${label}`,
    "",
    `Scans: ${s.scans}`,
    `Pure attacks (shown as one explanation): ${s.pure.length}`,
    ...list(s.pure),
    `Hybrids (real scam carrying an injection, full report): ${s.hybrid.length}`,
    ...list(s.hybrid),
    `Screenshot text flagged as aimed at the scanner: ${s.flagged.length}`,
    ...list(s.flagged, (r) => `  ${r.hits.map((h) => `"${h}"`).join(", ")}`),
    s.floors.length
      ? `ATTACK FLOOR APPLIED: ${s.floors.length} — the model scored a pure attack below 8.0`
      : "Attack floor applied: 0",
    ...list(s.floors),
    `Honest Business Model capped (false regulatory claim): ${s.caps.length}`,
    ...list(s.caps, (r) => `  ${r.claim}`),
  ].join("\n");
}

module.exports = { buildRedTeamSummary, formatRedTeamSummary };

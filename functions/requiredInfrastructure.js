/**
 * @file functions/requiredInfrastructure.js
 * @class Class 1 (Focused Logic Component)
 * @cap 150 Lines
 * @responsibility Apply required-infrastructure exceptions (config/
 *   requiredInfrastructure.json) to a delivered report: cap the Action
 *   Meter at the entry's score with its instructions, and record what the
 *   evidence-based score was.
 * @dependencies ./config/requiredInfrastructure.json, getVerdict (passed in)
 * @security_gate Changes only action_meter_score, the verdict, and adds a
 *   required_infrastructure block. Never removes or edits findings,
 *   metrics, evidence, or sources. Only lowers a score, never raises one.
 *   Never applies to a possible impersonator: not when a fraud or
 *   impersonation floor raiser fired, and not when the target points to a
 *   domain that is not the entity's own (app stores excepted).
 * @owner_context 411 Scanner policy ruling 2026-10-14 (The D&B Dilemma):
 *   necessity changes the action, not the facts.
 *
 * Signal pattern: the model may propose required_infrastructure (with
 * evidence) in action_meter_context; the server confirms only entities on
 * the configured list. A proposal for an unlisted entity is recorded as a
 * candidate for human review and changes nothing.
 */

const CONFIG = require("./config/requiredInfrastructure.json");

function normalize(text) {
  return ` ${String(text || "")
    .toLowerCase()
    .replace(/&/g, " & ")
    .replace(/[^a-z0-9&.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

/** The configured entry this consumer card identifies, or null. */
function matchRequiredInfrastructure(card, entries = CONFIG.entries) {
  if (!card) return null;
  const haystack = normalize(
    [card.target_name, card.developer_or_entity, card.entity_name, card.interface_surface].join(" | ")
  );
  return entries.find((entry) =>
    (entry.match || []).some((name) => haystack.includes(normalize(name)))
  ) || null;
}

/* Floor raisers that mean "not the real entity" or criminal conduct. */
const BLOCKING_FLOOR_RAISERS = [
  "brand_impersonation",
  "federal_impersonation",
  "credential_harvesting",
  "advance_fee",
  "confirmed_criminal",
  "extortion_mechanics",
];

const APP_STORE_HOSTS = ["play.google.com", "apps.apple.com"];

/* Hostnames in free text or URLs. Only tokens in host position count, so
 * a query value like ?id=com.dnb.mydnb (an app package) is not a domain. */
function hostsIn(text) {
  const hosts = [];
  const re = /(?:^|[\s/@(])((?:[a-z0-9-]+\.)+[a-z]{2,})(?=$|[\s/:?#)])/g;
  const source = String(text || "").toLowerCase();
  let m;
  while ((m = re.exec(source)) !== null) hosts.push(m[1].replace(/^www\./, ""));
  return hosts;
}

/** Why this card cannot get the exception, or null if it can. */
function impersonationRisk(card, report, entry) {
  const raisers = card.floor_raisers || {};
  const fired = BLOCKING_FLOOR_RAISERS.find((name) => raisers[name] === true);
  if (fired) return `floor_raiser:${fired}`;
  const own = (entry.domains || []).map((d) => d.toLowerCase());
  const hosts = [
    ...hostsIn(card.interface_surface),
    ...hostsIn(report?.solicitation_identity?.destination_domain),
  ];
  const foreign = hosts.find((h) =>
    !own.some((d) => h === d || h.endsWith(`.${d}`)) &&
    !APP_STORE_HOSTS.some((s) => h === s || h.endsWith(`.${s}`))
  );
  return foreign ? `foreign_domain:${foreign}` : null;
}

function modelProposal(card) {
  const context = card?.action_meter_context || {};
  const evidence = context.evidence?.required_infrastructure;
  return {
    proposed: context.required_infrastructure === true && Array.isArray(evidence) && evidence.length > 0,
    evidence: Array.isArray(evidence) ? evidence.slice(0, 5) : [],
  };
}

/**
 * Apply the exception to the report inside a scan result (fresh or cached;
 * both carry report.consumer_card). Mutates and returns a summary:
 * { status: "confirmed" | "candidate" | "blocked", entity, applied } or null.
 */
function applyRequiredInfrastructure(result, { getVerdict, entries = CONFIG.entries } = {}) {
  const card = result?.report?.consumer_card || result?.consumer_card;
  if (!card || typeof getVerdict !== "function") return null;
  const proposal = modelProposal(card);
  const entry = matchRequiredInfrastructure(card, entries);

  if (!entry) {
    if (!proposal.proposed) return null;
    const entity = card.developer_or_entity || card.target_name || "unknown";
    card.required_infrastructure = { status: "candidate", entity, evidence: proposal.evidence };
    return { status: "candidate", entity, applied: false };
  }

  const risk = impersonationRisk(card, result?.report, entry);
  if (risk) {
    // Looks like the entity's name on someone else's offer: score as is.
    card.required_infrastructure = { status: "blocked", id: entry.id, entity: entry.entity, reason: risk };
    return { status: "blocked", entity: entry.entity, applied: false, reason: risk };
  }

  const original = Number(card.action_meter_score);
  const originalLabel = card.verdict_label || null;
  // A cap, never a floor: a target already below the entry stays as scored.
  const applied = Number.isFinite(original) && original > entry.score;
  if (applied) {
    const verdict = getVerdict(entry.score);
    card.action_meter_score = entry.score;
    card.action_verdict_badge = verdict.badge;
    card.verdict_label = verdict.label;
  }
  card.required_infrastructure = {
    status: "confirmed",
    id: entry.id,
    entity: entry.entity,
    applied,
    evidence_based_score: Number.isFinite(original) ? original : null,
    evidence_based_verdict: originalLabel,
    instructions: entry.instructions,
    model_proposed: proposal.proposed,
  };
  return { status: "confirmed", entity: entry.entity, applied };
}

module.exports = {
  applyRequiredInfrastructure,
  matchRequiredInfrastructure,
  REQUIRED_INFRASTRUCTURE_ENTRIES: CONFIG.entries,
};

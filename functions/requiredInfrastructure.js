/**
 * @file functions/requiredInfrastructure.js
 * @class Class 1 (Focused Logic Component)
 * @cap 150 Lines
 * @responsibility Apply required-infrastructure exceptions (config/
 *   requiredInfrastructure.json) to a delivered report: a manual Action
 *   Meter entry. A listed entity always shows the entry's score and
 *   verdict, whatever the scan scored; the evaluated score is recorded.
 * @dependencies ./config/requiredInfrastructure.json, getVerdict (passed in)
 * @security_gate Changes only action_meter_score, the verdict, and adds a
 *   required_infrastructure block. Never removes or edits findings,
 *   metrics, evidence, or sources.
 *   Never applies to a possible impersonator: not when a fraud or
 *   impersonation floor raiser fired, and not when the target points to a
 *   domain that is not the entity's own (app stores excepted).
 *   Watchlisted entries (`watch`, ./watchlist.js) let historical or
 *   disputed impersonation stand as findings without blocking; adjudicated
 *   impersonation still blocks (owner ruling 2026-10-16, UAC).
 * @owner_context 411 Scanner policy ruling 2026-10-14 (The D&B Dilemma):
 *   necessity changes the action, not the facts.
 *
 * The evaluation never knows about this list: the model is not told
 * about required infrastructure (it tipped the 8.0 boundary judgment,
 * 2026-10-14), and the exception is applied only after scoring. Entries
 * are added by people, in the config.
 */

const CONFIG = require("./config/requiredInfrastructure.json");
const { ADJUDICATED, watchVerdict } = require("./watchlist");

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
function impersonationRisk(card, report, entry, watch = null) {
  const raisers = card.floor_raisers || {};
  const ignored = watch ? watch.seen.filter((name) => !watch.retriggered.includes(name)) : [];
  const fired = BLOCKING_FLOOR_RAISERS.find((name) => raisers[name] === true && !ignored.includes(name));
  if (fired) return watch && watch.retriggered.includes(fired) ? `watchlist_retrigger:${fired}` : `floor_raiser:${fired}`;
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

/**
 * Apply the exception to the report inside a scan result (fresh or cached;
 * both carry report.consumer_card). Mutates and returns a summary:
 * { status: "confirmed" | "blocked", entity, applied } or null.
 */
function applyRequiredInfrastructure(result, { getVerdict, entries = CONFIG.entries } = {}) {
  const card = result?.report?.consumer_card || result?.consumer_card;
  if (!card || typeof getVerdict !== "function") return null;
  const entry = matchRequiredInfrastructure(card, entries);
  if (!entry) return null;

  const watch = entry.watch ? watchVerdict(card, entry) : null;
  const watchNote = watch && watch.seen.length
    ? { watch: { seen: watch.seen, retriggered: watch.retriggered, evidence: watch.evidence } }
    : {};
  const risk = impersonationRisk(card, result?.report, entry, watch);
  if (risk) {
    // Looks like the entity's name on someone else's offer, or a
    // watchlisted entity's impersonation was adjudicated: score as is.
    card.required_infrastructure = { status: "blocked", id: entry.id, entity: entry.entity, reason: risk, ...watchNote };
    return { status: "blocked", entity: entry.entity, applied: false, reason: risk, ...watchNote };
  }

  const original = Number(card.action_meter_score);
  const originalLabel = card.verdict_label || null;
  // Manual entry (owner ruling 2026-10-14): the listed score is shown
  // whatever the scan scored, above or below it.
  const verdict = getVerdict(entry.score);
  card.action_meter_score = entry.score;
  card.action_verdict_badge = verdict.badge;
  card.verdict_label = verdict.label;
  const applied = true;
  card.required_infrastructure = {
    status: "confirmed",
    id: entry.id,
    entity: entry.entity,
    applied,
    evidence_based_score: Number.isFinite(original) ? original : null,
    evidence_based_verdict: originalLabel,
    instructions: entry.instructions,
    ...watchNote,
  };
  return { status: "confirmed", entity: entry.entity, applied, ...watchNote };
}

module.exports = {
  ADJUDICATED,
  applyRequiredInfrastructure,
  matchRequiredInfrastructure,
  REQUIRED_INFRASTRUCTURE_ENTRIES: CONFIG.entries,
};

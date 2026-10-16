/**
 * @file functions/watchlist.js
 * @class Class 1 (Focused Logic Component)
 * @cap 80 Lines
 * @responsibility Watchlisted entities (a manual-score entry with `watch`
 *   in config/requiredInfrastructure.json): decide whether impersonation
 *   evidence is historical/disputed (recorded, no points) or describes an
 *   adjudicated or official adverse outcome (re-triggers full weight).
 * @dependencies none
 * @security_gate Pure function of the delivered card. Errs toward
 *   re-triggering: any adjudication wording in the evidence counts.
 * @owner_context Owner ruling 2026-10-16 (UAC): history informs, current
 *   behavior drives the tier; disputed does not score.
 */

/*
 * Watchlist (owner ruling 2026-10-16, UAC): impersonation that is
 * historical or disputed stays in the findings and does not block the
 * entry. Evidence of an adjudicated or official adverse outcome re-triggers
 * full weight: the entry steps aside and the evaluated score shows.
 */
const ADJUDICATED = /\b(convicted|conviction|pleaded guilty|guilty plea|indicted|indictment|judgment|judgement|ruled against|found liable|court (order|ruling|found)|consent (order|decree|judgment)|injunction|settle(d|ment)|assurance of (voluntary )?(compliance|discontinuance)|attorney general (sued|filed|action|lawsuit)|ag (sued|lawsuit)|ftc (sued|complaint|action|order)|cease[- ]and[- ]desist|penalt(y|ies) (imposed|ordered|assessed)|fined|license (revoked|suspended)|charged with|arrested)\b/i;

const IMPERSONATION = /\b(impersonat\w*|posing as|posed as|pretend\w*|falsely (claim\w*|represent\w*|stat\w*)|false(ly)? (affiliation|partnership|endorsement)|claim\w* (to (be|represent|work with|partner)|ties|affiliation|partnership)|misrepresent\w* (itself|themselves|affiliation|as))/i;

function watchVerdict(card, entry) {
  const watched = (entry.watch && entry.watch.floorRaisers) || [];
  const raisers = card.floor_raisers || {};
  const evidence = card.floor_raiser_evidence || {};
  const seen = watched.filter((name) => raisers[name] === true);
  // The outcome must be about the impersonation itself: one statement
  // naming both. An unrelated judgment (telemarketing, billing) does not
  // re-trigger an impersonation raiser.
  const retriggered = seen.filter((name) => (evidence[name] || [])
    .some((e) => ADJUDICATED.test(String(e)) && IMPERSONATION.test(String(e))));
  return {
    seen,
    retriggered,
    evidence: Object.fromEntries(seen.map((name) => [name, (evidence[name] || []).join(" ").slice(0, 600)])),
  };
}

module.exports = { ADJUDICATED, IMPERSONATION, watchVerdict };

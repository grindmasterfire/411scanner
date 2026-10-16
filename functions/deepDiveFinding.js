/**
 * @file functions/deepDiveFinding.js
 * @class Class 2
 * @cap 200 lines
 * @responsibility Decide the ONE base-scan finding a Deep Dive investigates
 *   (DEEP_DIVE_SPEC.md: "a targeted follow-up investigation into a specific
 *   finding from the base scan"; never the whole target).
 * @dependencies none
 * @security_gate Client finding text is trimmed and length-capped; it is
 *   context for the model, never an instruction channel.
 * @owner_context 411 Scanner Deep Dive scope fix (fire 2026-10-16).
 */

const crypto = require("crypto");
const { extractFloorRaisers } = require("./actionMeterFloorRaisers");

const MAX_ID = 100;
const MAX_TEXT = 1000;

/*
 * Auto-suggest order when the client didn't pick a finding: a validated
 * Floor-Raiser outranks any metric, most severe first.
 */
const FLOOR_RAISER_SEVERITY = [
  "confirmed_criminal",
  "extortion_mechanics",
  "federal_impersonation",
  "brand_impersonation",
  "credential_harvesting",
  "advance_fee",
  "withdrawal_gate",
  "grey_market_credential_resale",
  "recruitment_gated_earnings",
  "rebrand_pattern",
  "coordinated_review_fraud",
  "data_brokerage",
  "subscription_dark_patterns",
  "ip_hostage_lock_in",
  "near_threshold_suspension",
  "ad_arbitrage_mfa_lure",
];

// Six vectors on the 0-10 scale; risk = how bad the score is.
const METRICS = [
  { key: "financial_risk", note: "financial_risk_note", name: "Financial Risk", lowerIsBetter: true },
  { key: "personal_data_exposure", note: "personal_data_note", name: "Personal Data Exposure", lowerIsBetter: true },
  { key: "wasted_time_and_ads", note: "wasted_time_note", name: "Wasted Time and Ads", lowerIsBetter: true },
  { key: "real_substance", note: "real_substance_note", name: "Real Substance", lowerIsBetter: false },
  { key: "practical_utility", note: "practical_utility_note", name: "Practical Utility", lowerIsBetter: false },
  { key: "honest_business_model", note: "honest_business_model_note", name: "Honest Business Model", lowerIsBetter: false },
];

function clean(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function humanize(key) {
  return key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

/** The finding the client sent, or null if it sent none usable. */
function clientFinding(raw) {
  if (!raw || typeof raw !== "object") return null;
  const findingText = clean(raw.findingText, MAX_TEXT);
  if (!findingText) return null;
  const findingId =
    clean(raw.findingId, MAX_ID) ||
    `client_${crypto.createHash("sha256").update(findingText).digest("hex").slice(0, 16)}`;
  return { findingId, findingText, source: "client" };
}

/**
 * Highest-risk finding in the base report (spec: "auto-suggests the
 * highest-risk finding"). fullReport is the Cache Bank copy; appSummary is
 * what the phone sent.
 */
function suggestFinding(fullReport, appSummary = {}) {
  const card = (fullReport && fullReport.consumer_card) || {};

  // Only raisers the server accepted (true AND evidenced), with their evidence.
  const accepted = extractFloorRaisers(fullReport || {});
  const camel = (key) => key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  const raiser = FLOOR_RAISER_SEVERITY.find((key) => accepted[camel(key)] === true);
  if (raiser) {
    const evidence = (card.floor_raiser_evidence || {})[raiser] || [];
    const detail = Array.isArray(evidence) && evidence.length ? `: ${evidence.join(" ")}` : "";
    return {
      findingId: `floor_${raiser}`,
      findingText: clean(`${humanize(raiser)} flagged by the base scan${detail}`, MAX_TEXT),
      source: "auto",
    };
  }

  const metrics = card.metrics || {};
  const notes = card.metric_annotations || {};
  let worst = null;
  for (const m of METRICS) {
    const value = Number(metrics[m.key]);
    if (!Number.isFinite(value)) continue;
    const risk = m.lowerIsBetter ? value : 10 - value;
    if (!worst || risk > worst.risk) worst = { ...m, value, risk };
  }
  if (worst) {
    const note = clean(notes[worst.note], MAX_TEXT);
    return {
      findingId: `metric_${worst.key}`,
      findingText: clean(`${worst.name} (${worst.value}/10)${note ? `: ${note}` : ""}`, MAX_TEXT),
      source: "auto",
    };
  }

  const complaint = clean(appSummary.complaintPattern, MAX_TEXT);
  if (complaint) {
    return { findingId: "complaint_pattern", findingText: `Complaint pattern: ${complaint}`, source: "auto" };
  }

  const verdict = clean(card.tagline || appSummary.verdictLabel, MAX_TEXT);
  return {
    findingId: "verdict",
    findingText: verdict ? `The base scan's verdict: ${verdict}` : "The base scan's verdict",
    source: "auto",
  };
}

function resolveFinding(raw, fullReport, appSummary) {
  return clientFinding(raw) || suggestFinding(fullReport, appSummary);
}

module.exports = {
  FLOOR_RAISER_SEVERITY,
  resolveFinding,
  suggestFinding,
};

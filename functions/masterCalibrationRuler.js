/**
 * @file functions/masterCalibrationRuler.js
 * @class Class 1
 * @cap 150 Lines
 * @responsibility Canonical 411 Scanner calibration and Action Meter governance reference.
 * @dependencies None
 * @security_gate Calibration reference only. Does not calculate scores or apply Floor-Raiser effects.
 * @owner_context 411 Scanner diagnostic engine
 */

const MASTER_CALIBRATION_RULER = Object.freeze({
  version: "2026-09",
  purpose:
    "Canonical calibration and governance reference for 411 Scanner diagnostic reasoning. " +
    "This module does not calculate a scan, apply numerical Floor-Raiser effects, " +
    "aggregate vectors, or determine the final Action Meter.",

  factors: Object.freeze([
    Object.freeze({
      key: "financial_risk",
      name: "Financial Risk",
      direction: "lower_is_better",
    }),
    Object.freeze({
      key: "personal_data_exposure",
      name: "Personal Data Exposure",
      direction: "lower_is_better",
    }),
    Object.freeze({
      key: "wasted_time_and_ads",
      name: "Wasted Time & Ads",
      direction: "lower_is_better",
    }),
    Object.freeze({
      key: "real_substance_and_depth",
      name: "Real Substance & Depth",
      direction: "higher_is_better",
    }),
    Object.freeze({
      key: "practical_utility",
      name: "Practical Utility",
      direction: "higher_is_better",
    }),
    Object.freeze({
      key: "honest_business_model",
      name: "Honest Business Model",
      direction: "higher_is_better",
    }),
  ]),

  actionMeterBands: Object.freeze([
    Object.freeze({
      min: 0.0,
      max: 2.9,
      label: "EVERYBODY",
      action: "Use it",
    }),
    Object.freeze({
      min: 3.0,
      max: 4.9,
      label: "MOSTLY EVERYBODY",
      action: "Generally fine",
    }),
    Object.freeze({
      min: 5.0,
      max: 5.5,
      label: "TRIBE",
      action: "Specialized audience / know what you're joining",
    }),
    Object.freeze({
      min: 5.6,
      max: 5.9,
      label: "TRIBE + KNOWLEDGE",
      action: "Understand mechanics",
    }),
    Object.freeze({
      min: 6.0,
      max: 6.9,
      label: "NOT FOR EVERYONE",
      action: "Don't enter casually",
    }),
    Object.freeze({
      min: 7.0,
      max: 7.9,
      label: "PROFESSIONAL CONSIDERATION ONLY",
      action: "Understand professionally",
    }),
    Object.freeze({
      min: 8.0,
      max: 8.9,
      label: "PASS ON THIS ONE",
      action: "Walk away",
    }),
    Object.freeze({
      min: 9.0,
      max: 9.9,
      label: "REMOVE FROM PLATFORM",
      action: "Platform/ecosystem intervention",
    }),
    Object.freeze({
      min: 10.0,
      max: Infinity,
      label: "DELETE FROM EARTH",
      action: "Extreme intervention",
    }),
  ]),

  boundary: Object.freeze({
    lower: 7.9,
    upper: 8.0,
    description:
      "7.9 requires professional understanding. 8.0 crosses into consumer-level disengagement " +
      "when acquisition mechanics make the burden unreasonable for an ordinary consumer to manage.",
  }),

  anchors: Object.freeze({
    andovar:
      "Approximately 4.x. Meaningful bounded participation and data exposure, but identifiable project, stated compensation, and no established severe acquisition hazard.",
    cryptoAirdrops:
      "Normally begins at 5.6-5.9 when participation itself requires meaningful specialized knowledge of wallets, networks, transactions, contracts, vesting, liquidity, custody, or comparable mechanics.",
    trufinco:
      "7.8. Consequential specialized financial strategy requiring substantial due diligence, without evidence establishing the same acquisition hazard as the 8.0 anchor.",
    nicoleCapra:
      "8.0. Specialized consequential proposition where acquisition mechanics materially minimize or obscure the professional burden expected of an ordinary consumer.",
    blockdag:
      "10+. Extreme anchor for severe malicious, predatory, destructive, or systemic behavior supported by exceptionally strong evidence.",
  }),

  floorRaiserGovernance: Object.freeze({
    identification:
      "Gemini identifies qualitative Floor-Raiser triggers only when concrete evidence supports them.",
    application:
      "The application/server validates triggers and applies numerical effects.",
    stacking: "Validated independent Floor Raisers are uncapped and stackable.",
    modelRestriction:
      "Gemini must never invent or apply numerical Floor-Raiser additions.",
  }),

  calibrationStatus: Object.freeze({
    strongAnchors:
      "Calibration is strongest around 4.x, 5.6-5.9, 7.x, the 7.9-8.0 boundary, and 10+.",
    remainingGaps:
      "Additional empirical anchors remain desirable for 0-2.9, 3-4.9 beyond Andovar, 5.0-5.5, 6.x, 8.x beyond Nicole Capra, and 9.x.",
  }),
});

module.exports = { MASTER_CALIBRATION_RULER };
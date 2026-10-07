/**
 * @file functions/scanErrorCodes.js
 * @responsibility Canonical 5-digit scan failure taxonomy (locked 2026-10-07).
 *
 * Users NEVER see raw HTTP codes. Every failure surfaces as a 5-digit code
 * plus one plain-language sentence (a technical person explaining to a
 * non-technical person). HTTP codes stay internal: receipts record both, the
 * Business Center reports both, the app shows only the 5-digit code.
 *
 * Digit scheme: F-AA-SS — F = family, AA = area, SS = specific error.
 * Families:
 *   1xxxx Connection (device cannot reach us)
 *   2xxxx Scanner engine (our backend stumbled)
 *   3xxxx AI research (the investigation could not finish)
 *   4xxxx Scans & billing (credits, plans, purchases)
 *   5xxxx Submission (problem with the link/target given)
 *   6xxxx Free scan & ads (weekly free scan and its ad gate)
 *   7xxxx Deep dive
 *   8xxxx Sign-in
 *   9xxxx Unknown (logged; try again)
 *
 * This table is the source of truth for the user manual / ToS listing.
 * The Android app carries a mirror copy (ScanErrorCodes.kt) — keep them in sync.
 */

const CODES = {
  "10101": "Your phone isn't connected to the internet. Check your connection and try again.",
  "10102": "The connection dropped while sending your scan. Try again.",
  "20101": "The scanner was still warming up. Wait a moment and try again.",
  "20102": "The scanner is busy right now. Try again shortly.",
  "20201": "The scanner hit an unexpected problem on our end. We've logged it \u2014 try again.",
  "20301": "The investigation took too long and timed out. Try again.",
  "30101": "Our research AI declined this target. Not everything can be investigated.",
  "30201": "Our safety systems blocked this investigation.",
  "40101": "You're out of scans on this plan. Top up or upgrade to keep going.",
  "40201": "Deep dives need a top-up credit. Pick up a top-up pack to unlock this.",
  "40301": "We couldn't verify that purchase. If you were charged, contact support.",
  "50101": "That doesn't look like a link we can scan. Check it and try again.",
  "50201": "That image is too large to scan. Try a smaller one.",
  "60101": "You've used this week's free scan. Come back next week, or pick a plan.",
  "60102": "The ad didn't finish playing. Watch it all the way through for your free scan.",
  "70101": "The deep dive ran into a problem. Try again.",
  "80101": "Your sign-in expired. Sign in again to continue.",
  "90101": "Something unexpected happened. We've logged it \u2014 try again.",
};

const FALLBACK_CODE = "90101";

function messageFor(code5) {
  return CODES[code5] || CODES[FALLBACK_CODE];
}

/*
 * Map an HTTP status to the user-facing 5-digit code. One HTTP code can map
 * to several 5-digit codes by cause — the 5-digit code says what happened
 * and what to do, not just the transport status.
 */
function httpStatusToCode5(status) {
  const s = Number(status) || 0;
  if (s === 400) return "50101";
  if (s === 401 || s === 403) return "80101";
  if (s === 404) return "20201";
  if (s === 413) return "50201";
  if (s === 429) return "20102";
  if (s === 500) return "20201";
  if (s === 502 || s === 503) return "20101";
  if (s === 504) return "20301";
  return FALLBACK_CODE;
}

/* Map an internal failure cause to the user-facing 5-digit code. */
function causeToCode5(cause) {
  switch (cause) {
    case "no_connectivity": return "10101";
    case "connection_dropped": return "10102";
    case "cold_start":
    case "warming_up": return "20101";
    case "overloaded": return "20102";
    case "engine_crash": return "20201";
    case "timeout": return "20301";
    case "model_refused":
    case "grounding_rejected": return "30101";
    case "safety_block": return "30201";
    case "out_of_scans": return "40101";
    case "deep_dive_no_credit": return "40201";
    case "purchase_unverified": return "40301";
    case "bad_link": return "50101";
    case "image_too_large": return "50201";
    case "free_scan_used": return "60101";
    case "ad_incomplete": return "60102";
    case "deep_dive_error": return "70101";
    case "unauthenticated": return "80101";
    default: return FALLBACK_CODE;
  }
}

module.exports = {
  CODES,
  FALLBACK_CODE,
  messageFor,
  httpStatusToCode5,
  causeToCode5,
};

/**
 * @file functions/scanDeliveryEvents.js
 * @class Class 1 (Focused Logic Component)
 * @cap 200 Lines
 * @responsibility Append small, immutable operational events for each scan
 *   (received, ad-gate outcome, charged or not, completion, research
 *   quality) so the Business Center can report delivery, ad-gate readiness,
 *   mass failures, prepaid burn, and research quality.
 * @dependencies None (db is passed in).
 * @security_gate Write-only, append-only, best-effort: a failed event write
 *   never affects a scan. Stores no image, OCR text, report content, or
 *   search-query text; only counts, codes, tier, and timing.
 * @owner_context 411 Scanner Business Center operational reporting.
 *
 * Collection: scan_delivery_events/{auto}
 *   type: "received" | "replayed" | "gate" | "completed" | "stale_claim"
 *   requestId, uid, atMs, plus per-type fields (see the record* helpers).
 */

const SCAN_DELIVERY_EVENTS_COLLECTION = "scan_delivery_events";

async function recordScanEvent(db, type, fields) {
  try {
    await db.collection(SCAN_DELIVERY_EVENTS_COLLECTION).add({
      type,
      atMs: Date.now(),
      ...fields,
    });
  } catch (e) {
    console.warn(`[scan-events] ${type} write failed: ${e.message}`);
  }
}

/* Domains in grounded sources: Gemini puts the site's domain in the title;
 * the uri is usually a vertexaisearch redirect, so it is used only when it
 * is not one. */
function groundedDomains(sources = []) {
  const domains = new Set();
  for (const s of sources) {
    const title = String(s?.title || "").trim().toLowerCase();
    if (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(title)) domains.add(title.replace(/^www\./, ""));
    try {
      const host = new URL(String(s?.uri || "")).hostname.toLowerCase();
      if (host && !host.includes("vertexaisearch")) domains.add(host.replace(/^www\./, ""));
    } catch (_) {
      // not a URL
    }
  }
  return domains;
}

function reportUrls(report) {
  const text = JSON.stringify(report || {});
  const urls = text.match(/https?:\/\/[^\s"'<>\\)]+/g) || [];
  return [...new Set(urls)];
}

/**
 * Research-quality counts for one fresh scan: how much live grounding it
 * had, and how many URLs in the report trace to a grounded source domain
 * (the rest were written by the model, Epic 9). Plus the Action Meter
 * score for the band distribution.
 */
function researchQuality(report, telemetry) {
  const gv = telemetry?.groundingVerification || {};
  const domains = groundedDomains(gv.sources);
  const urls = reportUrls(report);
  let grounded = 0;
  for (const u of urls) {
    try {
      const host = new URL(u).hostname.toLowerCase().replace(/^www\./, "");
      if ([...domains].some((d) => host === d || host.endsWith(`.${d}`))) grounded++;
    } catch (_) {
      // malformed URL counts as model-written
    }
  }
  const score = Number(report?.consumer_card?.action_meter_score);
  return {
    searchQueries: Number(gv.googleSearchQueryCount) || 0,
    groundedSources: Number(gv.groundedSourceCount) || 0,
    groundingSupports: Number(gv.groundingSupportCount) || 0,
    reportUrls: urls.length,
    groundedReportUrls: grounded,
    score: Number.isFinite(score) ? score : null,
  };
}

module.exports = {
  SCAN_DELIVERY_EVENTS_COLLECTION,
  recordScanEvent,
  researchQuality,
  _groundedDomains: groundedDomains,
  _reportUrls: reportUrls,
};

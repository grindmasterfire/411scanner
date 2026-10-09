/**
 * @file functions/scanWorkflow.js
 * @class Class 3 (Feature Orchestration Component)
 * @cap 400 Lines
 * @responsibility Orchestrate Cache Bank reuse, historical context, fresh Gemini research, persistence, and T07 request accounting.
 * @dependencies Cache Bank modules, historicalResearchContext,
 *               groundingVerification, geminiEngine,
 *               scanResultPersistence, scanLedgerIds,
 *               scanBusinessLedger.
 * @security_gate Current report reuse requires both temporal freshness and provider-proven grounding; historical evidence reuse remains a separate privilege.
 * @owner_context 411 Scanner server-side scan orchestration.
 *
 * Cache Bank decides whether completed current intelligence may be reused.
 * Temporal freshness and grounding certification are deliberately separate
 * requirements: being current does not prove that research actually occurred.
 *
 * T04 history may guide fresh research but never authorize stale conclusions.
 * T07 records accepted requests and provider attempts rejected by the
 * mandatory-grounding gate.
 */

const { HttpsError } = require("firebase-functions/v2/https");
const { buildCacheKey } = require("./cacheKey");

const {
  getCachedScanEntry,
  recordCacheHit,
  setCachedScanEntry,
} = require("./cacheEntryStore");

const { isCacheEntryFresh } = require("./cacheFreshness");

const { isTelemetryGrounded } =
  require("./groundingVerification");

const {
  buildAliasMetadata,
  findReusableCacheCandidate,
} = require("./cacheReuseResolver");

const { getHistoricalResearchContext } =
  require("./historicalResearchContext");

const { analyzeImageWithGemini, isTransientProviderError } = require("./geminiEngine");
const { persistFreshScanResult } = require("./scanResultPersistence");
const { resolveAllLinks } = require("./linkResolver");
const {
  runNetworkProbe,
  applyMeasuredLedger,
  applyRedirectPath,
} = require("./networkProbe");

const {
  createScanRequestId,
  createScanInvestigationId,
} = require("./scanLedgerIds");

const {
  recordReuseAccounting,
  recordFreshAccounting,
  recordGroundingRejectedAccounting,
} = require("./scanBusinessLedger");

const {
  checkEntitlement,
  consumeScan,
} = require("./entitlementStore");

/**
 * Execute one production scan.
 *
 * Pipeline:
 * image + optional OCR
 * → exact grounded current reuse
 * → safe grounded cross-creative reuse
 * → optional historical research context
 * → grounded Gemini research
 * → current intelligence persistence
 * → immutable T07 accounting
 */
async function executeScan(
  db,
  serverTimestamp,
  data = {},
  uid = null
) {
  // Loop A: identity is now available to the pipeline. Logged for
  // verification; server-side entitlement (Loop B) will consume it.
  console.log(`[scan] caller uid: ${uid || "anonymous"}`);

  /*
   * Request identity belongs to this invocation, not the intelligence
   * it returns. Declared here so both the scan IIFE and the post-scan
   * ledger block can reference it. Cache hits still receive unique receipts.
   */
  const requestId = data.clientRequestId || createScanRequestId();

  const __result = await (async () => {
  const imageBase64 = data.imageBase64;
  const mimeType = data.mimeType || "image/jpeg";
  const ocrText = data.ocrText || "";
  const prompt = data.prompt || "";

  if (!imageBase64) {
    throw new HttpsError(
      "invalid-argument",
      "An image is required."
    );
  }

  const entitlement = await checkEntitlement(db, uid);
  if (!entitlement.allowed) {
    if (entitlement.reason === "restricted") {
      throw new HttpsError(
        "permission-denied",
        "Your family admin has restricted scanning for your account."
      );
    }
    throw new HttpsError(
      "resource-exhausted",
      "You've used all your scans for this billing period."
    );
  }

  /*
   * Exact cache identity remains image-byte only. OCR variance must
   * not fragment exact-image continuity.
   */
  const cacheKey = buildCacheKey(imageBase64);

  const exactEntry =
    await getCachedScanEntry(db, cacheKey);

  /*
   * Exact reuse requires two independent privileges:
   * - the report is still inside its temporal freshness window;
   * - stored telemetry proves the source investigation used Google Search.
   *
   * This intentionally makes legacy or zero-search entries ineligible for
   * current reuse without deleting them. They fall through to fresh grounded
   * research and may be replaced naturally by the normal persistence path.
   */
  if (
    exactEntry &&
    isCacheEntryFresh(exactEntry) &&
    isTelemetryGrounded(
      exactEntry.telemetry
    )
  ) {
    await recordCacheHit(db, cacheKey);

    const receipt =
      await recordReuseAccounting(
        db,
        serverTimestamp,
        {
          requestId,
          mode: "exact",
          cacheKey,
          sourceCacheKey: cacheKey,
          report: exactEntry.report,
          sourceTelemetry:
            exactEntry.telemetry || null,
          tier: entitlement.tier || "free",
        }
      );

    return {
      report: exactEntry.report,
      cache: {
        hit: true,
        fresh: true,
        mode: "exact",
        key: cacheKey,
      },
      receipt,
    };
  }

  /*
   * Cross-creative reuse remains a T03 privilege and is allowed only
   * when this exact image has never been seen. A stale or ungrounded exact
   * image always forces fresh Gemini research rather than borrowing another
   * creative's completed report.
   */
  let reusableCandidate = null;

  if (!exactEntry) {
    reusableCandidate =
      await findReusableCacheCandidate(
        db,
        ocrText,
        cacheKey
      );
  }

  if (reusableCandidate) {
    const { candidate, assessment } =
      reusableCandidate;

    await recordCacheHit(
      db,
      candidate.cacheKey
    );

    /*
     * Alias inherits the source verification clock and telemetry.
     * T07 treats copied telemetry as provenance, never new expense.
     *
     * cacheCandidateMatcher already proved that source telemetry is
     * grounded before this alias path can be reached.
     */
    await setCachedScanEntry(
      db,
      cacheKey,
      candidate.report,
      serverTimestamp(),
      candidate.telemetry || null,
      buildAliasMetadata(
        candidate,
        ocrText
      )
    );

    const receipt =
      await recordReuseAccounting(
        db,
        serverTimestamp,
        {
          requestId,
          mode: "cross_creative",
          cacheKey,
          sourceCacheKey:
            candidate.cacheKey,
          report:
            candidate.report,
          sourceTelemetry:
            candidate.telemetry || null,
          tier: entitlement.tier || "free",
        }
      );

    return {
      report: candidate.report,
      cache: {
        hit: true,
        fresh: true,
        mode: "cross_creative",
        key: cacheKey,
        sourceKey:
          candidate.cacheKey,
        match: {
          overlap:
            assessment.overlap,
          anchorHits:
            assessment.anchorHits,
          strongAnchor:
            assessment.strongAnchor,
        },
      },
      receipt,
    };
  }

  /*
   * T04 history may now supply research leads only. Gemini still performs
   * the current investigation and the server recomputes current authority.
   *
   * An old entry may therefore remain useful as historical research context
   * even when it no longer possesses the privilege to be returned directly.
   */
  const historicalContext =
    await getHistoricalResearchContext(
      db,
      exactEntry,
      ocrText,
      cacheKey
    );

  const linkEvidence =
    await resolveAllLinks(ocrText);

  const probe =
    await runNetworkProbe(linkEvidence);

  const apiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GEMINI_API_KEY;

  if (!apiKey) {
    throw new HttpsError(
      "failed-precondition",
      "Gemini API key is not configured."
    );
  }

  /*
   * A grounding-rejected response already consumed provider resources.
   * Record that real cost, but do not let the rejected response become
   * diagnostic intelligence, history, or Cache Bank state.
   */
  let result;

  try {
    result =
      await analyzeImageWithGemini(
        apiKey,
        imageBase64,
        mimeType,
        prompt,
        historicalContext.evidencePacket,
        linkEvidence,
        probe
      );
  } catch (error) {
    if (
      error?.groundingRejected &&
      error?.scanTelemetry
    ) {
      await recordGroundingRejectedAccounting(
        db,
        serverTimestamp,
        {
          requestId,
          cacheKey,
          telemetry:
            error.scanTelemetry,
          groundingCause:
            error.groundingCause,
          tier: entitlement.tier || "free",
        }
      );
    }

    /*
     * T03 — Provider failure resilience.
     * Gemini 503 / 429 / timeout must not burn user entitlements.
     * Return "unavailable" so the client can offer a free retry.
     * Uses the shared transient-error classifier from geminiEngine
     * (covers 500/503/429/timeout/reset/hangup/fetch-failed).
     */
    const isProviderFailure = isTransientProviderError(error);

    if (isProviderFailure || error?.groundingRejected) {
      throw new HttpsError(
        "unavailable",
        "The analysis provider is temporarily " +
        "unavailable. Your scan was not counted. " +
        "Please try again in a moment."
      );
    }

    throw error;
  }

  /*
   * Accepted investigation identity is created only after the mandatory
   * grounding gate succeeds. Rejected responses never receive one.
   */
  const investigationId =
    createScanInvestigationId();

  const report = result.report;

  const telemetry = result.telemetry;

  // Server-owned infrastructure measurement (governance write).
  applyMeasuredLedger(report, probe);
  // Deterministic redirect-path evidence (governance write).
  applyRedirectPath(report, linkEvidence);
  let probeStatus = probe && probe.measured ? "measured" : "bypassed_no_target";

  // Fallback: OCR gave no URL, but the model identified a domain. Probe that
  // domain and re-apply so the Technical 411 fills whenever a domain is known.
  if (!probe || !probe.measured) {
    const tl = report.technical_ledger || {};
    const candidate =
      (tl.network_telemetry && tl.network_telemetry.app_package_or_domain) ||
      (tl.attribution && tl.attribution.official_domain) ||
      (report.solicitation_identity &&
        report.solicitation_identity.destination_domain) ||
      "";
    if (candidate && String(candidate).includes(".")) {
      const fallbackProbe = await runNetworkProbe(null, candidate);
      if (fallbackProbe && fallbackProbe.measured) {
        applyMeasuredLedger(report, fallbackProbe);
        probeStatus = "fallback_measured";
      }
    }
  }
  telemetry.probe_status = probeStatus;
  const composition =
    result.composition || null;

  /*
   * Attach T07 provenance before Cache Bank persistence so later reuse
   * can reference the investigation that paid for this intelligence.
   */
  telemetry.requestId = requestId;
  telemetry.investigationId =
    investigationId;

  /*
   * Record the trusted continuity path only when archived evidence
   * actually entered the current Gemini investigation.
   */
  if (
    historicalContext.evidencePacket &&
    historicalContext.continuity
  ) {
    telemetry.historicalContinuityMode =
      historicalContext.continuity.mode;

    telemetry.historicalSourceCacheKey =
      historicalContext.continuity
        .sourceCacheKey || null;
  } else {
    telemetry.historicalContinuityMode =
      null;
    telemetry.historicalSourceCacheKey =
      null;
  }

  const mode =
    exactEntry
      ? "stale_refresh"
      : "fresh_analysis";

  /*
   * Current persistence follows only the newly grounded report.
   * Historical evidence cannot directly create identity or scoring.
   *
   * A fresh-but-ungrounded exact entry also reaches this branch and is
   * intentionally classified as stale_refresh: existing current authority
   * was unusable, so 411 replaces it through fresh grounded research.
   */
  const persisted =
    await persistFreshScanResult(
      db,
      serverTimestamp,
      {
        cacheKey,
        report,
        telemetry,
        ocrText,
      }
    );

  /*
   * T07 accounting is downstream from diagnosis. It records what
   * happened; it never participates in deciding the result.
   */
  const receipt =
    await recordFreshAccounting(
      db,
      serverTimestamp,
      {
        requestId,
        investigationId,
        mode,
        cacheKey,
        report,
        telemetry,
        composition,
        solicitationIdentityKey:
          persisted.identityKey,
        tier: entitlement.tier || "free",
      }
    );

  const scanResult = {
    report,
    cache: {
      hit: false,
      fresh: true,
      mode,
      key: cacheKey,
    },
    telemetry,
    receipt,
    solicitationIdentity:
      persisted.solicitationIdentity,
    identityHistory:
      persisted.identityHistory,
  };

  // Store the full result for resumable scans. If the client's HTTP
  // request is interrupted, getScanResult(requestId) returns this.
  try {
    await db.collection("scan_results").doc(requestId).set({
      ...scanResult,
      requestId,
      uid,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.warn("[scan] result store failed:", e.message);
  }

  return scanResult;
  })();

  /*
   * The scan already ran: the ledger write must land. Transaction
   * contention is transient — retry the deduction (not the scan) with
   * backoff. quota_exhausted needs no retry (nothing left to deduct).
   */
  let consumeResult = await consumeScan(db, uid);
  for (
    let attempt = 0;
    attempt < 3 &&
    !consumeResult.consumed &&
    consumeResult.reason === "error";
    attempt++
  ) {
    await new Promise((r) => setTimeout(r, 150 * (attempt + 1)));
    consumeResult = await consumeScan(db, uid);
  }
  if (!consumeResult.consumed) {
    console.warn(
      `[scan] ledger consume failed (${consumeResult.reason}); ` +
        `scan ${requestId} served but uncounted.`
    );
  }
  return __result;
}

module.exports = {
  executeScan,
};

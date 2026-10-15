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
const { Timestamp } = require("firebase-admin/firestore");

const { messageFor, httpStatusToCode5, groundingCode5 } = require("./scanErrorCodes");

const SCAN_RESULT_TTL_MS = 24 * 60 * 60 * 1000;
const { buildCacheKey } = require("./cacheKey");

const {
  getCachedScanEntry,
  recordCacheHit,
  setCachedScanEntry,
} = require("./cacheEntryStore");

const { isCacheEntryFresh } = require("./cacheFreshness");

const { isTelemetryGrounded, meetsReportStandard } =
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
  isPlatformHost,
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
const { enforceAdGate, releaseAdGate } = require("./adGate");
const { recordScanEvent, researchQuality } = require("./scanDeliveryEvents");
const { applyRequiredInfrastructure } = require("./requiredInfrastructure");
const { getVerdict } = require("./actionMeter");

/*
 * Ad-gate rollout switch. Off (default): gate rejections are logged as
 * observe_would_reject_* and the scan proceeds, so the current app (which
 * sends no adTicket) keeps working. Turn on (AD_GATE_ENFORCED=true on the
 * scan service) only after the SSV-capable app build is live.
 */
const AD_GATE_ENFORCED = process.env.AD_GATE_ENFORCED === "true";

// App-store listing hosts: valid scan targets, but never probe targets.
const { extractEmailSender } = require("./emailSender");

/*
 * Email solicitations: catalog the sender with the solicitation and give
 * the client a receipt for it. Addresses come from the OCR text by strict
 * pattern, so they're exact and carry nothing injectable.
 */
function applyEmailSender(report, ocrText, scannerEmail = "") {
  const identity = report && report.solicitation_identity;
  if (!identity) return;
  identity.channel = String(identity.channel || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (identity.channel !== "email") return;
  const sender = extractEmailSender(ocrText, { exclude: [scannerEmail] });
  if (!sender) return;
  Object.assign(identity, sender);

  const notes = [];
  if (sender.sender_is_free_mail) notes.push("a free webmail account, not a business domain");
  if (sender.reply_to_differs) notes.push(`replies go to a different address, ${sender.reply_to_address}`);
  const ledger = report.technical_ledger || (report.technical_ledger = {});
  const receipts = ledger.evidence_receipts || (ledger.evidence_receipts = []);
  if (sender.sender_address && !receipts.some((r) => r.field === "email.sender")) {
    receipts.push({
      field: "email.sender",
      status: "verified",
      finding:
        `The email was sent from ${sender.sender_address}` +
        (notes.length ? `: ${notes.join("; ")}.` : "."),
      authority: "Screenshot text (411 server read)",
      subject: sender.sender_domain,
      identifier: sender.sender_address,
      source_url: "",
    });
  }
}

/*
 * Domains the finished report is about: the email's own sender domain, the
 * official site, and the solicitation's destination. Empty when the report
 * names none (then the probe can't be checked and is kept).
 */
function reportDomains(report) {
  const identity = (report && report.solicitation_identity) || {};
  const attribution = (report && report.technical_ledger && report.technical_ledger.attribution) || {};
  return [
    identity.channel === "email" && !identity.sender_is_free_mail ? identity.sender_domain : null,
    attribution.official_domain,
    identity.destination_domain,
  ]
    .map((d) => String(d || "").trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0].replace(/^www\./, ""))
    .filter((d) => d.includes(".") && !isPlatformHost(d));
}

function probeBelongsToReport(probe, report) {
  const domains = reportDomains(report);
  if (!domains.length) return true;
  const probed = String(probe.apex_domain || probe.domain || "").toLowerCase().replace(/^www\./, "");
  return domains.some((d) => d === probed || d.endsWith(`.${probed}`) || probed.endsWith(`.${d}`));
}

// App stores, social networks, and file hosts: never probe targets.
const isPlatformListing = (candidate) => isPlatformHost(candidate);

const EMPTY_NAMES = ["", "unknown", "n/a", "na", "none", "null", "unidentified"];

function hasEntityName(report) {
  const identity = (report && report.solicitation_identity) || {};
  const attribution =
    (report && report.technical_ledger && report.technical_ledger.attribution) || {};
  return [identity.canonical_name, identity.operator, attribution.operator_name]
    .some((n) => !EMPTY_NAMES.includes(String(n || "").trim().toLowerCase()));
}

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
  uid = null,
  caller = {}
) {
  // Tester account (verified email, resolved in index.js): never charged,
  // never blocked, never ad-gated.
  const isTester = caller.isTester === true;

  // Loop A: identity is now available to the pipeline. Logged for
  // verification; server-side entitlement (Loop B) will consume it.
  console.log(`[scan] caller uid: ${uid || "anonymous"}`);

  // WHY: diagnostic log to surface request shape when 50101 fires.
  // Remove after root cause confirmed.
  console.log(`[scan] data keys: ${Object.keys(data || {}).join(",") || "(none)"} | imageBase64 present: ${!!(data && data.imageBase64)} | imageBase64 length: ${(data && data.imageBase64) ? String(data.imageBase64).length : 0}`);

  /*
   * Request identity belongs to this invocation, not the intelligence
   * it returns. Declared here so both the scan IIFE and the post-scan
   * ledger block can reference it. Cache hits still receive unique receipts.
   */
  const requestId = data.clientRequestId || createScanRequestId();

  /*
   * Idempotency: a client request ID is claimed before the gate charges
   * anything, so a resend never runs or charges twice. A resend of a
   * request we already have gets its stored outcome, or "in progress".
   * This is what lets the app resend after a connection drop.
   */
  const startMs = Date.now();
  if (data.clientRequestId) {
    const existing = await claimScanRequest(db, serverTimestamp, requestId, uid);
    if (existing) {
      const state = settledScanOutcome(existing).state;
      await recordScanEvent(db, "replayed", { requestId, uid: uid || null, state });
      if (existing.pending && state === "failed") {
        await recordScanEvent(db, "stale_claim", { requestId, uid: uid || null });
      }
      return replayScanRequest(existing, uid);
    }
    await recordScanEvent(db, "received", { requestId, uid: uid || null });
  }

  /*
   * Business Center facts about this attempt, filled in as the pipeline
   * runs and recorded once with its outcome (scanDeliveryEvents).
   */
  const scanFacts = {
    tier: isTester ? "tester" : null,
    charged: false,
    chargedVia: null,
    quality: null,
    infrastructure: null,
  };
  const recordCompletion = (outcome) =>
    recordScanEvent(db, "completed", {
      requestId,
      uid: uid || null,
      tier: scanFacts.tier,
      charged: scanFacts.charged,
      chargedVia: scanFacts.chargedVia,
      durationMs: Date.now() - startMs,
      quality: scanFacts.quality,
      infrastructure: scanFacts.infrastructure,
      ...outcome,
    });

  let __result;
  try {
  __result = await (async () => {
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

  const entitlement = isTester
    ? { allowed: true, tier: "tester" }
    : await checkEntitlement(db, uid);
  if (!entitlement.allowed) {
    if (entitlement.reason === "restricted") {
      throw new HttpsError(
        "permission-denied",
        "Your family admin has restricted scanning for your account.",
        { code5: "40102" }
      );
    }
    throw new HttpsError(
      "resource-exhausted",
      "You've used all your scans for this billing period.",
      { code5: "40101" }
    );
  }

  /*
   * Every validated attempt is counted from here — before cache lookup or
   * any Gemini call — so aborted scans (e.g. no target) cannot be replayed
   * for free. Transaction contention is transient: retry the deduction with
   * backoff. If the deduction still fails (race lost, restriction, or a
   * persistent ledger error), fail closed: nothing has been spent yet, and
   * an uncounted scan is free compute. Only "free" (no bucket; its weekly
   * scan was spent at the ad gate), the tester, and "no_uid" proceed
   * uncounted. With the ad gate enforced, no_uid never gets this far.
   */
  /*
   * Rewarded-ad gate: everyone except the tester and Professional must
   * present a Google-verified (SSV) ad ticket. Free tier also spends its
   * one scan per rolling 7 days here. Runs before the quota deduction so a
   * missing ad never costs a subscriber a scan.
   */
  let adGate;
  try {
    adGate = await enforceAdGate(db, {
      uid,
      isTester,
      tier: entitlement.tier,
      adTicket: data.adTicket,
      adNoFill: data.adNoFill === true,
    });
  } catch (gateErr) {
    // Observe mode (rollout): log what enforcement would reject and let
    // the scan through until the SSV-capable app build is live.
    if (AD_GATE_ENFORCED || !(gateErr instanceof HttpsError)) throw gateErr;
    adGate = { mode: `observe_would_reject_${gateErr.details?.code5}` };
  }
  console.log(`[scan] ad gate: ${adGate.mode} | scan ${requestId}`);
  scanFacts.tier = scanFacts.tier || entitlement.tier || "free";
  await recordScanEvent(db, "gate", {
    requestId,
    uid: uid || null,
    tier: scanFacts.tier,
    mode: adGate.mode,
  });
  // The free tier's weekly scan is spent at the ad gate.
  if (adGate.mode === "free_verified") {
    scanFacts.charged = true;
    scanFacts.chargedVia = "free_weekly";
  }

  let consumeResult = isTester
    ? { consumed: false, reason: "tester" }
    : await consumeScan(db, uid);
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
  if (consumeResult.consumed && !consumeResult.isTester) {
    scanFacts.charged = true;
    scanFacts.chargedVia = consumeResult.via || "subscription";
  }
  if (
    !consumeResult.consumed &&
    consumeResult.reason !== "free" &&
    consumeResult.reason !== "tester" &&
    consumeResult.reason !== "no_uid"
  ) {
    await releaseAdGate(db, adGate);
    console.warn(
      `[scan] ledger consume failed (${consumeResult.reason}); ` +
        `scan ${requestId} rejected.`
    );
    throw new HttpsError(
      "resource-exhausted",
      "You've used all your scans for this billing period.",
      { code5: "40101" }
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
    ) &&
    meetsReportStandard(
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
     * Gemini 503 / 429 / timeout returns "unavailable" so the client can
     * offer a retry. The attempt was already counted at the gate: no free
     * retries, because "not counted" failures are an exploitable surface.
     * Uses the shared transient-error classifier from geminiEngine
     * (covers 500/503/429/timeout/reset/hangup/fetch-failed).
     */
    const isProviderFailure = isTransientProviderError(error);

    if (error?.groundingRejected) {
      // Say what actually happened: no search, empty search, or unverified.
      const code5 = groundingCode5(error.groundingCause);
      throw new HttpsError("unavailable", messageFor(code5), { code5 });
    }

    if (isProviderFailure) {
      throw new HttpsError(
        "unavailable",
        "The analysis provider is temporarily " +
        "unavailable. This attempt was counted against your quota. " +
        "Please try again in a moment.",
        { code5: "20102" }
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
  scanFacts.quality = researchQuality(report, telemetry);

  // Deterministic redirect-path evidence (governance write).
  applyRedirectPath(report, linkEvidence);
  // Email screenshots: sender read from the screenshot text, never the model.
  applyEmailSender(report, ocrText, caller.email);

  /*
   * The probe must measure a domain this report is about. The first probe
   * targets a domain read from the screenshot text, which can be app
   * chrome or an OCR slip (Yahoo Mail's "mail.yahoo.com" read as
   * "mailyahoo.com" put Yahoo's registrar on two senders' reports). If it
   * matches none of the report's own domains, drop it and probe theirs.
   */
  const relatedProbe =
    probe && probe.measured && probeBelongsToReport(probe, report) ? probe : null;
  if (relatedProbe) {
    // Server-owned infrastructure measurement (governance write).
    applyMeasuredLedger(report, relatedProbe);
  }
  let probeStatus = relatedProbe
    ? "measured"
    : probe && probe.measured
      ? "unrelated_probe_discarded"
      : "bypassed_no_target";

  // Fallback: OCR gave no usable URL, but the model resolved a target (from
  // the image or by grounded search on the entity name). Probe that domain
  // and re-apply so the Technical 411 fills whenever a domain is known.
  if (!relatedProbe) {
    const tl = report.technical_ledger || {};
    const identity = report.solicitation_identity || {};
    const candidates = [
      identity.channel === "email" && !identity.sender_is_free_mail ? identity.sender_domain : null,
      tl.network_telemetry && tl.network_telemetry.app_package_or_domain,
      tl.attribution && tl.attribution.official_domain,
      identity.destination_domain,
    ].filter((c) => c && String(c).includes("."));
    const ownDomains = candidates.filter((c) => !isPlatformListing(c));

    if (candidates.length && !ownDomains.length) {
      // Only platform hosts (app store, LinkedIn, ...): their infrastructure
      // says nothing about the business; proceed on OSINT + model analysis.
      probeStatus = "platform_target_no_probe";
    } else if (ownDomains.length) {
      candidates.splice(0, candidates.length, ...ownDomains);
      const fallbackProbe = await runNetworkProbe(null, candidates[0]);
      if (fallbackProbe && fallbackProbe.measured) {
        applyMeasuredLedger(report, fallbackProbe);
        probeStatus = "fallback_measured";
      } else {
        probeStatus = "fallback_unmeasured";
      }
    } else if (hasEntityName(report)) {
      probeStatus = "entity_only_no_target";
    }
  }
  telemetry.probe_status = probeStatus;

  /*
   * Guard: Abort truly unidentifiable scans before billing and persistence.
   * Only reached when OCR found no target, the model resolved no
   * destination (even via grounded search), and no entity name was
   * extracted — there is nothing to evaluate. The attempt was already
   * counted at the gate, so aborting here cannot be replayed for free.
   * Added 2026-10-10 per Gemini interrogator diagnosis; narrowed 2026-10-13
   * so identified entities without a probeable domain still proceed.
   */
  if (probeStatus === "bypassed_no_target") {
    throw new HttpsError(
      "failed-precondition",
      "Scan aborted: no target domain could be identified from the image or analysis. This attempt was counted against your quota.",
      { code5: "50102" }
    );
  }

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

  return scanResult;
  })();
  } catch (error) {
    /*
     * A failed scan is recorded too, so a client that lost the connection
     * (swiped away, process death) learns the outcome — the attempt was
     * counted — instead of polling for a report that will never exist.
     */
    const failure = scanFailureOutcome(error);
    await storeScanOutcome(db, serverTimestamp, requestId, uid, {
      failed: true,
      ...failure,
    });
    await recordCompletion({ ok: false, code5: failure.code5 });
    throw error;
  }

  /*
   * Required-infrastructure exceptions (ruling 2026-10-14): on every
   * delivered path, cache hits included, so a report cached before an
   * entry was added still gets it. Findings are untouched.
   */
  relabelVerdict(__result);
  scanFacts.infrastructure = applyRequiredInfrastructure(__result, { getVerdict });

  // Resumable scans: every delivered path, cache hits included.
  // Stored and returned as the client view: the replay and getScanResult
  // paths hand back exactly what the phone may see.
  const delivered = clientView(__result);
  await storeScanOutcome(db, serverTimestamp, requestId, uid, delivered);
  await recordCompletion({ ok: true, code5: null });

  return delivered;
}

/**
 * Resumable scans: if the client's HTTP request drops (backgrounded app,
 * process death, flaky network), getScanResult(requestId) returns the
 * stored outcome — the report, or { failed, code5, message }. Expires
 * after 24h (Firestore TTL on expiresAt) so it never becomes a second
 * Cache Bank. Best-effort: a store failure never changes the scan outcome.
 */
async function storeScanOutcome(db, serverTimestamp, requestId, uid, outcome) {
  try {
    await db.collection("scan_results").doc(requestId).set({
      ...outcome,
      requestId,
      uid: uid || null,
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + SCAN_RESULT_TTL_MS),
    });
  } catch (e) {
    console.warn(`[scan] result store failed for ${requestId}: ${e.message}`);
  }
}

/*
 * A claim whose scan never wrote an outcome (instance killed at the 300s
 * timeout, crash before the catch) is dead after this long.
 */
const SCAN_CLAIM_STALE_MS = 6 * 60 * 1000;

function isAlreadyExists(error) {
  return error?.code === 6 ||
    error?.code === "already-exists" ||
    error?.code === "ALREADY_EXISTS";
}

/**
 * Claim a client request ID. Returns null when claimed (run the scan),
 * or the existing scan_results document when this request was seen
 * before. If the claim cannot be written for another reason, the scan
 * runs unclaimed, as before idempotency existed.
 */
async function claimScanRequest(db, serverTimestamp, requestId, uid) {
  const ref = db.collection("scan_results").doc(requestId);
  try {
    await ref.create({
      pending: true,
      requestId,
      uid: uid || null,
      claimedAtMs: Date.now(),
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + SCAN_RESULT_TTL_MS),
    });
    return null;
  } catch (e) {
    if (!isAlreadyExists(e)) {
      console.warn(`[scan] request claim failed for ${requestId}: ${e.message}`);
      return null;
    }
  }
  const snap = await ref.get();
  return snap.exists ? snap.data() : null;
}

/**
 * What a stored scan_results document means right now:
 * { state: "pending" } | { state: "failed", code5, message } |
 * { state: "ready", result }. A stale claim is a timed-out scan.
 */
function settledScanOutcome(doc, nowMs = Date.now()) {
  if (doc.pending) {
    if (nowMs - (Number(doc.claimedAtMs) || 0) < SCAN_CLAIM_STALE_MS) {
      return { state: "pending" };
    }
    return { state: "failed", code5: "20301", message: messageFor("20301") };
  }
  if (doc.failed) {
    return { state: "failed", code5: doc.code5, message: doc.message };
  }
  const result = { ...doc };
  delete result.createdAt;
  delete result.expiresAt;
  return { state: "ready", result };
}

/** Answer a resend from what the first request already did. */
function replayScanRequest(existing, uid) {
  if ((existing.uid || null) !== (uid || null)) {
    throw new HttpsError("already-exists", "This request ID is already in use.");
  }
  const outcome = settledScanOutcome(existing);
  if (outcome.state === "pending") {
    // The app treats this as "keep following", never as a failure.
    throw new HttpsError("already-exists", "This scan is already running.", { inProgress: true });
  }
  if (outcome.state === "failed") {
    throw new HttpsError("aborted", outcome.message || messageFor(outcome.code5), { code5: outcome.code5 });
  }
  console.log(`[scan] replayed stored outcome for ${existing.requestId}`);
  return outcome.result;
}

/*
 * What the phone receives: the report and the cache key (Deep Dive needs
 * it). Model names, token counts, pricing, cache mechanics, identity
 * internals, and exception internals stay server-side; the Business
 * Center reads them from receipts and investigations. An OSINT tool's
 * users include bad actors: nothing about how the scanner works leaves it.
 */
function clientView(result) {
  if (!result || !result.report) return result;
  const report = { ...result.report };
  const ri = report.consumer_card?.required_infrastructure;
  if (ri) {
    report.consumer_card = {
      ...report.consumer_card,
      required_infrastructure: { status: ri.status, applied: ri.applied === true, entity: ri.entity },
    };
  }
  return { report, cache: { key: result.cache?.key || null } };
}

/*
 * One action ladder everywhere: a report cached before the ladder changed
 * carries an old verdict label. Re-derive label and badge from the score
 * (the score itself is untouched).
 */
function relabelVerdict(result) {
  const card = result?.report?.consumer_card || result?.consumer_card;
  const score = Number(card?.action_meter_score);
  if (!card || !Number.isFinite(score)) return;
  const verdict = getVerdict(score);
  card.action_verdict_badge = verdict.badge;
  card.verdict_label = verdict.label;
}

/** The user-facing code5 + message for a thrown scan error. */
function scanFailureOutcome(error) {
  const serverCode5 = error?.details?.code5;
  if (serverCode5) {
    return { code5: serverCode5, message: error.message || messageFor(serverCode5) };
  }
  const status = error instanceof HttpsError
    ? error.httpErrorCode?.status
    : 500;
  const code5 = httpStatusToCode5(status);
  return { code5, message: messageFor(code5) };
}

module.exports = {
  executeScan,
  settledScanOutcome,
  // test hooks
  _scanFailureOutcome: scanFailureOutcome,
  _claimScanRequest: claimScanRequest,
  _relabelVerdict: relabelVerdict,
  _clientView: clientView,
  _replayScanRequest: replayScanRequest,
  SCAN_CLAIM_STALE_MS,
  _isPlatformListing: isPlatformListing,
  _applyEmailSender: applyEmailSender,
  _probeBelongsToReport: probeBelongsToReport,
  _hasEntityName: hasEntityName,
};

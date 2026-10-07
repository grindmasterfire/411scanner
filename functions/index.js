/**
 * @file functions/index.js
 * @class Class 4 (Callable Function Router)
 * @cap 600 Lines
 * @responsibility Initialize Firebase and expose production callable endpoints.
 * @dependencies firebase-functions, firebase-admin, scanWorkflow,
 *               deepDiveEngine, deepDiveCacheLayer.
 * @security_gate Routing only; diagnostic authority remains in server-owned modules.
 * @owner_context 411 Scanner Cloud Functions production entry point.
 *
 * @architecture_note
 * This file intentionally stays thin.
 *
 * Scan intelligence, Cache Bank reuse, identity continuity, state
 * persistence, historical-evidence logic, and T07 accounting belong
 * in child modules. The callable router validates endpoint-level inputs
 * and delegates execution rather than accumulating feature logic.
 */

const {
  onCall,
  HttpsError,
} = require("firebase-functions/v2/https");

const admin =
  require("firebase-admin");

const {
  executeScan,
} = require("./scanWorkflow");

const {
  getEntitlement,
  checkDeepDiveEntitlement,
  consumeDeepDive,
  grantEntitlement,
  grantTopUp,
  linkFamilySeat,
} = require("./entitlementStore");

const {
  getCachedDeepDive,
  setCachedDeepDive,
} = require("./deepDiveCacheLayer");

const {
  buildRevenueEvent,
  logRevenueEvent,
} = require("./revenueEvents");

const {
  generateDeepDive,
} = require("./deepDiveEngine");

admin.initializeApp();

const db =
  admin.firestore();

function serverTimestamp() {
  return admin.firestore.FieldValue
    .serverTimestamp();
}

/**
 * Production scan endpoint.
 *
 * Transport only. The scanner pipeline lives in scanWorkflow.js.
 */
exports.scan = onCall(
  {
    region: "us-central1",
    timeoutSeconds: 300,
    memory: "1GiB",
  },
  async (request) =>
    (async () => {
      // WHY: learn who is scanning. Guests send no token and are allowed
      // through as uid=null; only a present-but-invalid token is ignored.
      let uid = null;
      try {
        const h = (request.rawRequest && request.rawRequest.headers && request.rawRequest.headers.authorization) || "";
        if (h.startsWith("Bearer ")) {
          const decoded = await admin.auth().verifyIdToken(h.slice(7));
          uid = decoded.uid;
        }
      } catch (e) { uid = null; }
      return executeScan(db, serverTimestamp, request.data || {}, uid);
    })()
);

/**
 * Production Deep Dive endpoint.
 *
 * Deep Dive remains separate from the initial scan. This endpoint
 * owns request validation and caching; deepDiveEngine.js owns model
 * execution.
 */
exports.deepDive = onCall(
  {
    region: "us-central1",
    timeoutSeconds: 120,
    memory: "1GiB",
  },
  async (request) => {
    // Deep dives spend top-up credits only — never subscription scans.
    // Gate at the top; the credit is deducted after input validation and
    // before any cache lookup or Gemini call, so malformed requests never
    // burn credits while every delivered result costs exactly 1.
    let uid = null;
    try {
      const h = (request.rawRequest && request.rawRequest.headers && request.rawRequest.headers.authorization) || "";
      if (h.startsWith("Bearer ")) {
        const decoded = await admin.auth().verifyIdToken(h.slice(7));
        uid = decoded.uid;
      }
    } catch (e) { uid = null; }
    const ddEntitlement = await checkDeepDiveEntitlement(db, uid);
    if (!ddEntitlement.allowed) {
      throw new HttpsError(
        "resource-exhausted",
        "Deep dive requires a top-up credit."
      );
    }

    const data =
      request.data || {};

    const targetName =
      data.targetName;

    const cacheKey =
      data.cacheKey;

    const originalReport =
      data.report;

    if (!targetName) {
      throw new HttpsError(
        "invalid-argument",
        "A target name is required."
      );
    }

    if (!cacheKey) {
      throw new HttpsError(
        "invalid-argument",
        "A cache key is required."
      );
    }

    await consumeDeepDive(db, uid);

    const cachedDeepDive =
      await getCachedDeepDive(
        cacheKey,
        targetName
      );

    if (cachedDeepDive) {
      return {
        deepDive:
          cachedDeepDive,

        cache: {
          hit: true,
        },
      };
    }

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
     * Deep Dive reasons only from the completed report supplied by
     * the client. It does not conduct another independent scan.
     */
    const reportSummary =
      originalReport || {};

    const {
      text,
      telemetry,
    } =
      await generateDeepDive(
        apiKey,
        reportSummary,
        targetName
      );

    await setCachedDeepDive(
      cacheKey,
      targetName,
      text
    );

    return {
      deepDive:
        text,

      cache: {
        hit: false,
      },

      telemetry,
    };
  }
);

/*
 * Grant a scan entitlement after a Play purchase.
 * Verifies the caller's identity via the ID token (auto on onCall).
 *
 * Product IDs below MUST match the subscription / in-app product IDs
 * created in Play Console exactly. Subscription products grant a tier
 * bucket; top-up products (consumable) credit the subscriber's top-up bank.
 *
 * Play purchase verification (launch gate):
 * Set PLAY_VERIFY_ENABLED=true in the function environment once the Play
 * Console service account exists, then implement verifyPlayPurchase()
 * against the Google Play Developer API (purchases.subscriptions.get /
 * purchases.products.get) and reject unless the purchase is ACTIVE /
 * ACKNOWLEDGED for the reported productId. Until then this trusts the
 * client-reported productId — NOT launch-safe.
 */
const PRODUCT_MAP = {
  rental_weekly:   { kind: "subscription", tier: "rental", period: "weekly" },
  // The Android app's BillingManager queries "standard_weekly" and the
  // paywall sells it as the $3.99 weekly pass — that IS the rental tier,
  // so the app-facing ID maps onto the rental grant.
  standard_weekly: { kind: "subscription", tier: "rental", period: "weekly" },
  standard_monthly:{ kind: "subscription", tier: "standard", period: "monthly" },
  standard_annual: { kind: "subscription", tier: "standard", period: "annual" },
  pro_monthly:     { kind: "subscription", tier: "pro", period: "monthly" },
  pro_annual:      { kind: "subscription", tier: "pro", period: "annual" },
  family_monthly:  { kind: "subscription", tier: "family", period: "monthly" },
  family_annual:   { kind: "subscription", tier: "family", period: "annual" },
};

const TOPUP_MAP = {
  topup_5:        { kind: "topup", scans: 5 },
  topup_10:       { kind: "topup", scans: 10 },
  topup_20:       { kind: "topup", scans: 20 },
  topup_family_25:{ kind: "topup", scans: 25 },
};

/*
 * Server-side Play verification hook. Returns { verified: true } or throws.
 * Fail-closed: when verification is enabled but not yet implemented, every
 * grant is rejected rather than trusted.
 */
async function verifyPlayPurchase(purchaseToken, productId) {
  if (process.env.PLAY_VERIFY_ENABLED !== "true") {
    console.warn(
      "[play-verify] DISABLED — trusting client-reported productId. NOT launch-safe."
    );
    return { verified: true, mode: "trust-client" };
  }
  // TODO(play-verify): implement against the Play Developer API with the
  // Play Console service account, then reject unless the purchase is
  // ACTIVE (subscriptions) / ACKNOWLEDGED (consumables) for productId.
  throw new HttpsError(
    "failed-precondition",
    "Play verification is enabled but not implemented."
  );
}

exports.grantEntitlement = onCall(
  { region: "us-central1", timeoutSeconds: 30, memory: "256MiB" },
  async (request) => {
    const uid = request.auth && request.auth.uid;
    const data = request.data || {};
    const productId = data.productId || null;

    // Record a rejected grant attempt as a revenue event, then rethrow the
    // original error. Rejections are the fraud/abuse signal. The event
    // write never alters the outcome.
    async function rejectAttempt(
      reason,
      error
    ) {
      await logRevenueEvent(
        db,
        buildRevenueEvent({
          uid,
          productId,
          verificationMode: "unknown",
          verificationVerified: false,
          outcome: "rejected",
          rejectionReason: reason,
        })
      );
      throw error;
    }

    if (!uid) {
      await rejectAttempt(
        "unauthenticated",
        new HttpsError(
          "unauthenticated",
          "Sign-in required to grant a subscription."
        )
      );
    }
    const map =
      PRODUCT_MAP[productId] ||
      TOPUP_MAP[productId];
    if (!map) {
      await rejectAttempt(
        "unknown-product",
        new HttpsError(
          "invalid-argument",
          "Unknown product."
        )
      );
    }

    let verification;
    try {
      verification = await verifyPlayPurchase(
        data.purchaseToken,
        productId
      );
    } catch (error) {
      await rejectAttempt(
        "verify-failed",
        error
      );
    }

    const verifyMode =
      (verification && verification.mode) ||
      "unknown";
    const verifyOk = !!(
      verification && verification.verified
    );
    const playOrderId =
      (verification &&
        verification.playOrderId) ||
      null;

    async function recordGrant(
      familyGroupId
    ) {
      await logRevenueEvent(
        db,
        buildRevenueEvent({
          uid,
          productId,
          verificationMode: verifyMode,
          verificationVerified: verifyOk,
          playOrderId,
          outcome: "granted",
          familyGroupId:
            familyGroupId || null,
        })
      );
    }

    if (map.kind === "topup") {
      let result;
      try {
        result = await grantTopUp(
          db,
          uid,
          map.scans
        );
      } catch (error) {
        // Play took the money but the grant failed — log it so the
        // operator can make it right. Then rethrow to the client.
        await rejectAttempt(
          "grant-failed",
          error
        );
      }
      await recordGrant(null);
      return {
        granted: true,
        kind: "topup",
        credited: result.credited,
      };
    }
    let doc;
    try {
      doc = await grantEntitlement(
        db,
        uid,
        map.tier,
        map.period
      );
    } catch (error) {
      await rejectAttempt(
        "grant-failed",
        error
      );
    }
    await recordGrant(
      doc.familyGroupId
    );
    return {
      granted: true,
      kind: "subscription",
      tier: doc.tier,
      scansAllowed: doc.scansAllowed,
    };
  }
);

/*
 * Link another Google account as a seat on the caller's family group.
 * The caller must own a family group; the seat joins the shared bucket.
 * data: { seatUid }
 */
exports.linkFamilySeat = onCall(
  { region: "us-central1", timeoutSeconds: 30, memory: "256MiB" },
  async (request) => {
    const uid = request.auth && request.auth.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign-in required.");
    const data = request.data || {};
    if (!data.seatUid) throw new HttpsError("invalid-argument", "seatUid required.");
    const ent = await getEntitlement(db, uid);
    if (!ent || !ent.familyGroupId) {
      throw new HttpsError("failed-precondition", "No family group found for this user.");
    }
    const result = await linkFamilySeat(db, ent.familyGroupId, uid, data.seatUid);
    return { linked: true, ...result };
  }
);

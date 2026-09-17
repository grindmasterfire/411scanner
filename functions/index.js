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
  getCachedDeepDive,
  setCachedDeepDive,
} = require("./deepDiveCacheLayer");

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
    timeoutSeconds: 120,
    memory: "1GiB",
  },
  async (request) =>
    executeScan(
      db,
      serverTimestamp,
      request.data || {}
    )
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

/**
 * 411 SCANNER — Production Function Entry Point
 * Architecture: Class 4 — Complex System / Router
 * Responsibility: Expose production scan, Deep Dive, and token QA.
 * Cap: 600 lines
 *
 * Security:
 * - Server owns final score and verdict.
 * - Cache Bank stores completed scan reports.
 * - Solicitation identity remains separate from T03 pattern identity.
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

const {
  buildCacheKey,
  getCachedScanReport,
  setCachedScanReport,
} = require("./cacheLayer");

const {
  getCachedDeepDive,
  setCachedDeepDive,
} = require("./deepDiveCacheLayer");

const {
  analyzeImageWithGemini,
} = require("./geminiEngine");

const {
  generateDeepDive,
} = require("./deepDiveEngine");

const {
  buildSolicitationIdentityKey,
  getSolicitationHistory,
  saveSolicitationHistory,
} = require("./solicitationIdentity");

admin.initializeApp();

const db = admin.firestore();

/**
 * Extract the confirmed/related solicitation identity fields from
 * the authoritative Gemini scan report.
 *
 * T03 pattern identity is intentionally not handled here.
 */
function extractSolicitationIdentity(report) {
  const identity = report?.solicitation_identity;

  if (!identity || typeof identity !== "object") {
    return null;
  }

  return {
    canonicalName: identity.canonical_name || null,
    operator: identity.operator || null,
    destinationDomain: identity.destination_domain || null,
    destinationPath: identity.destination_path || null,
    offerMechanic: identity.offer_mechanic || null,
    confidence: identity.confidence || "unknown",
  };
}

/**
 * Production scan endpoint.
 *
 * Pipeline:
 * Screenshot/OCR
 * → Cache Bank
 * → Gemini grounded analysis
 * → Solicitation identity continuity
 * → Cache Bank archival
 * → Client
 */
exports.scan = onCall(
  {
    region: "us-central1",
    timeoutSeconds: 120,
    memory: "1GiB",
  },
  async (request) => {
    const data = request.data || {};

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

    const cacheKey = buildCacheKey(
      imageBase64,
      ocrText
    );

    const cachedReport =
      await getCachedScanReport(
        db,
        cacheKey
      );

    if (cachedReport) {
      return {
        report: cachedReport,
        cache: {
          hit: true,
          key: cacheKey,
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

    const result =
      await analyzeImageWithGemini(
        apiKey,
        imageBase64,
        mimeType,
        prompt
      );

    const report = result.report;
    const telemetry = result.telemetry;

    /*
     * Existing confirmed/related solicitation identity continuity.
     *
     * IMPORTANT T03 BOUNDARY:
     * solicitation_pattern is intentionally NOT read here.
     *
     * Pattern recognition may produce a pattern_key or pattern_only
     * finding, but it cannot establish actor identity.
     *
     * Only the independently grounded solicitation_identity object
     * enters the confirmed solicitation-identity machinery.
     */
    const solicitationIdentity =
      extractSolicitationIdentity(report);

    let identityHistory = null;

    if (solicitationIdentity) {
      const identityKey =
        buildSolicitationIdentityKey(
          solicitationIdentity
        );

      if (identityKey) {
        identityHistory =
          await getSolicitationHistory(
            db,
            identityKey
          );

        await saveSolicitationHistory(
          db,
          identityKey,
          solicitationIdentity,
          cacheKey,
          admin.firestore.FieldValue.serverTimestamp()
        );
      }
    }

    /*
     * Cache the completed scan report.
     *
     * The complete normalized T03 solicitation_pattern,
     * including deterministic pattern_key, lives inside report
     * and is therefore preserved by the existing Cache Bank.
     *
     * No second T03 cache or identity system is created.
     * Historical pattern retrieval remains a T04 responsibility.
     */
    await setCachedScanReport(
      db,
      cacheKey,
      report,
      admin.firestore.FieldValue.serverTimestamp(),
      telemetry
    );

    return {
      report,
      cache: {
        hit: false,
        key: cacheKey,
      },
      telemetry,
      solicitationIdentity,
      identityHistory,
    };
  }
);

/**
 * Production Deep Dive endpoint.
 *
 * Deep Dive execution is isolated in deepDiveEngine.js.
 * This router owns request validation and Deep Dive caching only.
 */
exports.deepDive = onCall(
  {
    region: "us-central1",
    timeoutSeconds: 120,
    memory: "1GiB",
  },
  async (request) => {
    const data = request.data || {};

    const targetName = data.targetName;
    const cacheKey = data.cacheKey;
    const originalReport = data.report;

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
        deepDive: cachedDeepDive,
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

    const reportSummary =
      originalReport || {};

    const {
      text,
      telemetry,
    } = await generateDeepDive(
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
      deepDive: text,
      cache: {
        hit: false,
      },
      telemetry,
    };
  }
);

/**
 * Read-only token QA endpoint.
 *
 * This endpoint exists for production telemetry/QA verification
 * and does not mutate scan intelligence.
 */
exports.qaTokens = onCall(
  {
    region: "us-central1",
    timeoutSeconds: 30,
    memory: "512MiB",
  },
  async () => {
    const snapshot = await db
      .collection("token_qa")
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();

    const records = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return {
      records,
      count: records.length,
    };
  }
);
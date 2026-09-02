const { onCall, HttpsError } = require("firebase-functions/v2/https");

const admin = require("firebase-admin");

const { buildCacheKey, getCachedScanReport, setCachedScanReport } = require("./cacheLayer");

const { analyzeImageWithGemini, generateDeepDive } = require("./geminiEngine");

admin.initializeApp();

const db = admin.firestore();

/**
 * Primary scan function — 2,000 token budget, results cached in Firestore.
 */

exports.scan = onCall(
  {
    timeoutSeconds: 120,
    memory: "512MiB",
    cors: true
  },
  async (request) => {
    try {
      const data = request.data;

      const rawImage =
        (data && data.image) ||
        (data && data.data && data.data.image) ||
        (typeof data === "string" ? data : null);

      const mimeType =
        (data && data.mimeType) ||
        (data && data.data && data.data.mimeType) ||
        "image/jpeg";

      if (!rawImage) {
        console.error("411 Scanner rejected payload. Keys:", Object.keys(data || {}));
        throw new HttpsError(
          "invalid-argument",
          "The function must be called with a base64 encoded 'image' string."
        );
      }

      const cleanBase64 = rawImage.replace(/^data\:image\/\w+;base64,/, "");

      const ocrTokens =
        (data && data.ocrTokens) ||
        (data && data.data && data.data.ocrTokens);

      const cacheKey = buildCacheKey(cleanBase64, ocrTokens);

      const cachedReport = await getCachedScanReport(db, cacheKey);

      if (cachedReport) {
        return {
          status: "ok",
          report: cachedReport,
          cached: true
        };
      }

      const apiKey = process.env.GEMINI_API_KEY;

      if (!apiKey) {
        throw new HttpsError(
          "failed-precondition",
          "GEMINI_API_KEY is not configured in the environment."
        );
      }

      const prompt =
        (data && data.prompt) ||
        (data && data.data && data.data.prompt);

      const { report: parsedReport, telemetry } =
        await analyzeImageWithGemini(
          apiKey,
          cleanBase64,
          mimeType,
          prompt
        );

      await setCachedScanReport(
        db,
        cacheKey,
        parsedReport,
        admin.firestore.FieldValue.serverTimestamp(),
        telemetry
      );

      return {
        status: "ok",
        report: parsedReport,
        cached: false
      };
    } catch (error) {
      if (error instanceof HttpsError) throw error;

      console.error("411 Scanner scan error:", error);

      throw new HttpsError(
        "internal",
        error.message || "Scan failed."
      );
    }
  }
);

/**
 * Deep Dive function — on demand, 1,000 token budget, never cached.
 * Called only when user taps "Would You Like To Know More?"
 */

exports.deepDive = onCall(
  {
    timeoutSeconds: 60,
    memory: "256MiB",
    cors: true
  },
  async (request) => {
    try {
      const data = request.data;
      const payload = data && data.data ? data.data : data;

      const targetName = payload && payload.targetName;

      if (!targetName) {
        throw new HttpsError(
          "invalid-argument",
          "targetName is required for deep dive."
        );
      }

      const apiKey = process.env.GEMINI_API_KEY;

      if (!apiKey) {
        throw new HttpsError(
          "failed-precondition",
          "GEMINI_API_KEY is not configured in the environment."
        );
      }

      const reportSummary = {
        targetName: targetName,
        actionMeterScore: payload.actionMeterScore || 0,
        verdictLabel: payload.verdictLabel || "",
        essential411: payload.essential411 || "",
        classificationBadges: payload.classificationBadges || "",
        revenueModel: payload.revenueModel || "",
        pricing: payload.pricing || "",
        complaintPattern: payload.complaintPattern || "",
        reviewSpread: payload.reviewSpread || "",
        technicalFlags: payload.technicalFlags || ""
      };

      const deepDiveText = await generateDeepDive(
        apiKey,
        reportSummary,
        targetName
      );

      return {
        status: "ok",
        result: deepDiveText
      };
    } catch (error) {
      if (error instanceof HttpsError) throw error;

      console.error("411 Scanner deep dive error:", error);

      throw new HttpsError(
        "internal",
        error.message || "Deep dive failed."
      );
    }
  }
);
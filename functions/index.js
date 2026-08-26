const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { buildCacheKey, getCachedScanReport, setCachedScanReport } = require("./cacheLayer");
const { analyzeImageWithGemini } = require("./geminiEngine");

admin.initializeApp();
const db = admin.firestore();

/**
 * 411 Scanner HTTPS Callable Cloud Function (Firebase Functions 2nd Gen).
 * Configured with 120-second timeout and 512MB RAM for multimodal Search Grounding.
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

      // Robust payload unwrapping: handles flat, callable-nested, and raw data envelopes
      const rawImage =
        (data && data.image) ||
        (data && data.data && data.data.image) ||
        (typeof data === "string" ? data : null);

      const mimeType =
        (data && data.mimeType) ||
        (data && data.data && data.data.mimeType) ||
        "image/jpeg";

      if (!rawImage) {
        console.error("411 Scanner rejected payload. Received data keys:", Object.keys(data || {}));
        throw new HttpsError(
          "invalid-argument",
          "The function must be called with a base64 encoded 'image' string."
        );
      }

      const cleanBase64 = rawImage.replace(/^data:image\/\w+;base64,/, "");

      // 1. Check Firestore Edge Cache
      const ocrTokens = (data && data.ocrTokens) || (data && data.data && data.data.ocrTokens);
      const cacheKey = buildCacheKey(cleanBase64, ocrTokens);
      const cachedReport = await getCachedScanReport(db, cacheKey);
      if (cachedReport) {
        return {
          status: "ok",
          report: cachedReport,
          cached: true
        };
      }

      // 2. Validate Gemini API Key configuration
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new HttpsError(
          "failed-precondition",
          "GEMINI_API_KEY is not configured in the environment."
        );
      }

      // 3. Execute Multimodal Analysis Engine
      const prompt = (data && data.prompt) || (data && data.data && data.data.prompt);
      const parsedReport = await analyzeImageWithGemini(
        apiKey,
        cleanBase64,
        mimeType,
        prompt
      );

      // 4. Populate Firestore Edge Cache
      await setCachedScanReport(
        db,
        cacheKey,
        parsedReport,
        admin.firestore.FieldValue.serverTimestamp()
      );

      return {
        status: "ok",
        report: parsedReport,
        cached: false
      };
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }
      console.error("411 Scanner Gemini error:", error);
      throw new HttpsError(
        "internal",
        error.message || "An error occurred while processing the scan."
      );
    }
  }
);
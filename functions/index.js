const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { buildCacheKey, getCachedScanReport, setCachedScanReport } = require("./cacheLayer");
const { analyzeImageWithGemini } = require("./geminiEngine");

admin.initializeApp();
const db = admin.firestore();

/**
 * 411 Scanner HTTPS Callable Cloud Function.
 * Orchestrates payload validation, Firestore edge caching, and multimodal Gemini analysis.
 */
exports.scan = functions.https.onCall(async (data, context) => {
  try {
    const imageBase64 = data && data.image ? data.image : null;
    const mimeType = (data && data.mimeType) || "image/jpeg";

    if (!imageBase64) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "The function must be called with a base64 encoded 'image' string."
      );
    }

    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    // 1. Check Firestore Edge Cache
    const cacheKey = buildCacheKey(cleanBase64, data && data.ocrTokens);
    const cachedReport = await getCachedScanReport(db, cacheKey);
    if (cachedReport) {
      return {
        status: "ok",
        report: cachedReport,
        cached: true
      };
    }

    // 2. Validate Gemini API Key configuration
    const apiKey = process.env.GEMINI_API_KEY || functions.config().gemini?.key;
    if (!apiKey) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "GEMINI_API_KEY is not configured in the environment."
      );
    }

    // 3. Execute Analysis Engine
    const parsedReport = await analyzeImageWithGemini(
      apiKey,
      cleanBase64,
      mimeType,
      data.prompt
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
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    console.error("411 Scanner Gemini error:", error);
    throw new functions.https.HttpsError(
      "internal",
      error.message || "An error occurred while processing the scan."
    );
  }
});

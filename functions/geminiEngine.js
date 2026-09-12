/**
 * @file functions/geminiEngine.js
 * @class Class 5
 * @cap 500 lines
 * @responsibility Execute grounded Gemini scans and assemble the completed report.
 * @dependencies @google/generative-ai, firebase-functions/v2/https,
 *               ./prompt, ./geminiResponseSchema, ./geminiReportParser,
 *               ./solicitationPattern, ./actionMeter
 * @security_gate Server owns final score; model output never controls Action Meter.
 * @owner_context 411 Scanner diagnostic engine.
 *
 * T03:
 * Gemini describes what the solicitation is.
 * solicitationPattern.js creates the deterministic archival pattern identity.
 * Actor identity remains separate from solicitation-pattern recognition.
 */

const {
  GoogleGenerativeAI,
} = require("@google/generative-ai");

const {
  HttpsError,
} = require("firebase-functions/v2/https");

const {
  SYSTEM_PROMPT,
} = require("./prompt");

const {
  RESPONSE_SCHEMA,
} = require("./geminiResponseSchema");

const {
  safeParseGeminiJson,
} = require("./geminiReportParser");

const {
  normalizeSolicitationPattern,
} = require("./solicitationPattern");

const {
  calculateScore,
  extractFloorRaisers,
  getVerdict,
} = require("./actionMeter");

/**
 * Executes a grounded image scan through Gemini.
 *
 * Public interface intentionally remains unchanged so index.js does not
 * need to know about the internal atomic decomposition.
 *
 * @param {string} apiKey
 * @param {string} cleanBase64
 * @param {string} mimeType
 * @param {string} prompt
 * @returns {Promise<{report: object, telemetry: object}>}
 */
async function analyzeImageWithGemini(
  apiKey,
  cleanBase64,
  mimeType,
  prompt
) {
  if (!cleanBase64) {
    throw new HttpsError(
      "invalid-argument",
      "Missing base64 image payload."
    );
  }

  if (!apiKey) {
    throw new HttpsError(
      "failed-precondition",
      "GEMINI_API_KEY is not configured."
    );
  }

  // Credential remains runtime-provided.
  // Never hard-code or fabricate credential material here.
  const genAI =
    new GoogleGenerativeAI(apiKey);

  const model =
    genAI.getGenerativeModel({
      model: "gemini-3.6-flash",

      systemInstruction:
        SYSTEM_PROMPT,

      tools: [
        {
          googleSearch: {}
        }
      ],

      generationConfig: {
        responseMimeType:
          "application/json",

        responseSchema:
          RESPONSE_SCHEMA,

        temperature: 0.2,

        maxOutputTokens: 7000
      }
    });

  const imagePart = {
    inlineData: {
      data: cleanBase64,
      mimeType:
        mimeType || "image/jpeg"
    }
  };

  const promptToExecute =
    prompt ||
    `Identify the primary solicitation in this image, reconstruct the target and CTA, complete the grounded web crawl, compile the empirical evidence, classify the target, derive all six risk factors from that evidence, identify any confirmed floor raisers, and return the complete diagnostic report JSON.

For T03 solicitation recognition, describe the solicitation pattern independently of confirmed actor identity.

UNKNOWN ACTOR does not mean UNKNOWN SOLICITATION.

Do not treat similar patterns as proof of the same actor.

Do not generate Deep Dive.`;

  const result =
    await model.generateContent([
      promptToExecute,
      imagePart
    ]);

  const rawText =
    result.response.text();

  const parsedData =
    safeParseGeminiJson(rawText);

  /*
   * T03 boundary:
   *
   * Gemini characterizes the solicitation.
   * The deterministic normalizer creates pattern_key.
   *
   * Pattern identity does not enter solicitation_identity.
   * Pattern similarity never establishes actor identity.
   */
  parsedData.solicitation_pattern =
    normalizeSolicitationPattern(
      parsedData.solicitation_pattern
    );

  const usageMetadata =
    result.response.usageMetadata || {};

  const telemetry = {
    operation: "initial_scan",

    model:
      "gemini-3.6-flash",

    promptTokenCount:
      usageMetadata.promptTokenCount || 0,

    candidatesTokenCount:
      usageMetadata.candidatesTokenCount || 0,

    totalTokenCount:
      usageMetadata.totalTokenCount || 0,

    cachedContentTokenCount:
      usageMetadata.cachedContentTokenCount || 0,

    thoughtsTokenCount:
      usageMetadata.thoughtsTokenCount || 0,

    finishReason:
      result.response.candidates?.[0]?.finishReason ||
      null
  };

  /*
   * Server-owned Action Meter.
   *
   * Gemini may propose a score in consumer_card.action_meter_score,
   * but that value is never authoritative.
   */
  const floorRaisers =
    extractFloorRaisers(parsedData);

  const score =
    calculateScore(
      parsedData.consumer_card.metrics,
      floorRaisers
    );

  const verdict =
    getVerdict(score);

  parsedData.consumer_card.action_meter_score =
    score;

  parsedData.consumer_card.action_verdict_badge =
    verdict.badge;

  parsedData.consumer_card.verdict_label =
    verdict.label;

  /*
   * Alternatives remain a presentation decision derived from the
   * server-owned score.
   */
  parsedData.alternatives.renders =
    score >= 5.6;

  return {
    report: parsedData,
    telemetry
  };
}

module.exports = {
  analyzeImageWithGemini
};
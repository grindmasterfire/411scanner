/**
 * @file functions/geminiReportParser.js
 * @class Class 1
 * @cap 150 lines
 * @responsibility Parse and minimally repair Gemini JSON responses.
 * @dependencies firebase-functions/v2/https
 * @security_gate Never creates findings or changes report semantics.
 * @owner_context 411 Scanner Gemini response boundary.
 */

const { HttpsError } = require("firebase-functions/v2/https");

/**
 * Removes a surrounding Markdown JSON fence when Gemini returns one.
 *
 * @param {string} rawText
 * @returns {string}
 */
function stripJsonFence(rawText) {
  let text = String(rawText || "").trim();

  if (!text.startsWith("```")) {
    return text;
  }

  return text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

/**
 * Performs the only permitted structural JSON repair.
 *
 * @param {string} text
 * @returns {object}
 */
function parseJsonWithTrailingCommaRepair(text) {
  try {
    return JSON.parse(text);
  } catch (firstError) {
    const repaired = text
      .replace(/,\s*}/g, "}")
      .replace(/,\s*]/g, "]");

    try {
      return JSON.parse(repaired);
    } catch (secondError) {
      throw new HttpsError(
        "internal",
        `Gemini returned invalid JSON: ${firstError.message}`
      );
    }
  }
}

/**
 * Parses Gemini's structured diagnostic response.
 *
 * This function deliberately does not:
 * - calculate scores
 * - identify actors
 * - normalize solicitation patterns
 * - manufacture missing evidence
 *
 * @param {string} rawText
 * @returns {object}
 */
function safeParseGeminiJson(rawText) {
  const text = stripJsonFence(rawText);

  try {
    return parseJsonWithTrailingCommaRepair(text);
  } catch (error) {
    console.error(
      "411 Scanner raw Gemini response (parse failed):",
      text.substring(0, 800)
    );

    console.error(
      "411 Scanner parse error:",
      error.message
    );

    throw error;
  }
}

module.exports = {
  safeParseGeminiJson
};
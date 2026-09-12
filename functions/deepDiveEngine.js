/**
 * @file functions/deepDiveEngine.js
 * @class Class 5
 * @cap 500 lines
 * @responsibility Execute the existing Gemini Deep Dive.
 * @dependencies @google/generative-ai, firebase-functions/v2/https, ./prompt
 * @security_gate Deep Dive uses the existing completed report and does not establish identity.
 * @owner_context 411 Scanner diagnostic engine
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");
const { HttpsError } = require("firebase-functions/v2/https");
const { SYSTEM_PROMPT } = require("./prompt");

async function generateDeepDive(
  apiKey,
  originalReport,
  targetName
) {
  if (!apiKey) {
    throw new HttpsError(
      "failed-precondition",
      "GEMINI_API_KEY is not configured."
    );
  }

  const genAI = new GoogleGenerativeAI(apiKey);

  const model = genAI.getGenerativeModel({
    model: "gemini-3.6-flash",
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 7000
    }
  });

  const prompt = `Generate the on-demand Deep Dive 411 for "${targetName}".

Use only the evidence contained in the previously completed report below. Do not invent facts, sources, contacts, prices, complaints, or conclusions.

Previous report:
${JSON.stringify(originalReport)}

Cover:
1. The core mechanic and how the target actually works underneath the marketing.
2. The money math, including actual costs, earnings, fees, and unit economics when supported.
3. The complaint record, including patterns across independent sources.
4. The fine print that materially changes the user's understanding.
5. Who the target is actually for and who is unlikely to benefit.
6. Specific verification steps before engaging.

Write plain prose only.
No bullets.
No headers.
No em-dashes.
Cold forensic voice.
Use only evidence from the completed research record.`;

  const result = await model.generateContent(prompt);
  const usageMetadata = result.response.usageMetadata || {};

  const telemetry = {
    operation: "deep_dive",
    model: "gemini-3.6-flash",
    promptTokenCount: usageMetadata.promptTokenCount || 0,
    candidatesTokenCount: usageMetadata.candidatesTokenCount || 0,
    totalTokenCount: usageMetadata.totalTokenCount || 0,
    cachedContentTokenCount:
      usageMetadata.cachedContentTokenCount || 0,
    thoughtsTokenCount:
      usageMetadata.thoughtsTokenCount || 0,
    finishReason:
      result.response.candidates?.[0]?.finishReason || null
  };

  return {
    text: result.response.text(),
    telemetry
  };
}

module.exports = {
  generateDeepDive,
};
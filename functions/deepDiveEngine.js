/**
 * @file functions/deepDiveEngine.js
 * @class Class 5
 * @cap 500 lines
 * @responsibility Execute the Gemini Deep Dive: fresh Google Search grounded research beyond the base report.
 * @dependencies @google/generative-ai, firebase-functions/v2/https
 * @security_gate Deep Dive uses the existing completed report as context only and does not establish identity.
 * @owner_context 411 Scanner diagnostic engine
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");
const { HttpsError } = require("firebase-functions/v2/https");
const { estimateGroundingCost } = require("./groundingCostEstimator");

/*
 * Narrow Deep Dive contract. Deliberately separate from the base scan
 * SYSTEM_PROMPT: no 6-factor analysis, no Action Meter, no Essential 411.
 * The app renders plain text, so section labels are plain lines, not markdown.
 */
const DEEP_DIVE_SYSTEM_PROMPT = `You are the 411 Scanner Deep Dive investigator.

A base scan has already been completed on a target. You are given that base report for context ONLY. Your job is to perform fresh web research with Google Search and report ONLY what is new.

RULES

1. Do not restate, reword, or summarize anything the base report already covers. The user has already read it. Repeating it is a failure.
2. Present only NEW findings from fresh research: specific complaint quotes, regulatory actions, enforcement records, court cases, forum and Reddit threads, fee schedules, payout terms, contract and terms-of-service language found online.
3. Every factual claim must cite a source found in this research, written as the page title and its URL. No unsourced assertions. If you cannot source a claim, leave it out.
4. Do not rely on prior model knowledge for facts. If a fact did not come from this research, do not state it.
5. Do not re-score the target, recalculate any risk score, or restate the verdict.
6. If the research turns up nothing new, say exactly: "No new findings beyond the base report." Then list in Sources what you searched and checked.

FORMAT

Use these five sections in this order. Write each label on its own line, in capitals, exactly as shown, with no markdown symbols:

FINDING
One or two sentences naming the specific question you investigated. Choose the single most consequential open question the base report raises. Do not recap the base report.

INVESTIGATION
The new evidence, as plain narrative prose. Quote complaints and terms directly where you found them.

TIMELINE
When the new evidence appeared and how it has evolved, with dates.

OPTIONS
What the user can concretely do, grounded in the evidence you found: verification steps, recourse channels, regulators to contact, alternatives.

SOURCES
Every source cited above, one per line, as: title - URL

STYLE

Cold forensic voice. Plain prose within sections. No em-dashes. About 2000 words at most.`;

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
    systemInstruction: DEEP_DIVE_SYSTEM_PROMPT,
    tools: [
      {
        googleSearch: {},
      },
    ],
    generationConfig: {
      temperature: 1.0,
      maxOutputTokens: 16000
    }
  });

  const prompt = `Target: "${targetName}"

Base report (context only; do not restate any of it):
${JSON.stringify(originalReport)}

Research this target on the web now and write the Deep Dive per your rules.`;

  const result = await model.generateContent(prompt);
  const usageMetadata = result.response.usageMetadata || {};
  // Same provider-reported search count and paid rate as the base scan.
  const groundingEconomics = estimateGroundingCost(result.response);

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
    googleSearchQueryCount:
      groundingEconomics.googleSearchQueryCount,
    groundingCostUsd:
      groundingEconomics.estimatedGroundingCostUsdAtPaidRate,
    groundingRateVersion:
      groundingEconomics.pricing.rateVersion,
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

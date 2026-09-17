/**
 * @file functions/geminiEngine.js
 * @class Class 5
 * @cap 600 Lines
 * @responsibility Execute grounded Gemini investigations, retry one ungrounded provider attempt, aggregate request economics, validate Technical 411 evidence, and finalize the server-owned report.
 * @dependencies @google/generative-ai, firebase-functions/v2/https,
 *               ./prompt, ./geminiResponseSchema, ./geminiReportParser,
 *               ./solicitationPattern, ./actionMeter,
 *               ./historicalPromptContext, ./tokenCostEstimator,
 *               ./groundingCostEstimator, ./groundingVerification,
 *               ./technicalLedgerEvidence, ./scanCompositionMeter
 * @security_gate Fresh intelligence cannot reach scoring, persistence, or Cache Bank admission unless provider metadata proves live Google Search grounding and grounded web sources.
 * @owner_context 411 Scanner diagnostic engine.
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

const {
  buildHistoricalResearchPrompt,
} = require("./historicalPromptContext");

const {
  estimateGeminiTokenCost,
} = require("./tokenCostEstimator");

const {
  estimateGroundingCost,
} = require("./groundingCostEstimator");

const {
  buildGroundingVerification,
} = require("./groundingVerification");

const {
  normalizeTechnicalEvidence,
} = require("./technicalLedgerEvidence");

const {
  measureScanComposition,
} = require("./scanCompositionMeter");

const MODEL_NAME =
  "gemini-3.6-flash";

const MANDATORY_GROUNDING_INSTRUCTION = `
MANDATORY 411 GROUNDING REQUIREMENT:

This is a new or refreshed 411 investigation.

You MUST actually invoke Google Search during this request and use current grounded web evidence before writing the report.

Do not rely only on model memory, the submitted image, historical evidence, or cached model context.

If useful evidence is limited, perform the grounded search anyway and report the limitation honestly.
`;

const GROUNDING_RETRY_INSTRUCTION = `
MANDATORY LIVE WEB VERIFICATION RETRY:

The previous provider attempt did not produce sufficient provider-confirmed live grounding.

You MUST invoke Google Search during this attempt and use the resulting grounded web evidence.

Do not complete the report from model memory alone.

Verify the material claims needed for this 411, including target identity, official destination, regulatory or registration claims when applicable, pricing/business-model facts, and other consequential evidence.

If a fact cannot be established, mark it unresolved, not found, not applicable, or not researched as appropriate rather than assuming it.
`;

function cloneProviderUsage(usageMetadata) {
  return JSON.parse(
    JSON.stringify(
      usageMetadata || {}
    )
  );
}

function roundMoney(value) {
  return Number(
    Number(value || 0)
      .toFixed(8)
  );
}

/**
 * Build forensic economics for one provider attempt.
 */
function buildAttemptTelemetry(
  response,
  attemptNumber
) {
  const usageMetadata =
    response.usageMetadata || {};

  const groundingVerification =
    buildGroundingVerification(
      response
    );

  const tokenEconomics =
    estimateGeminiTokenCost(
      usageMetadata
    );

  const groundingEconomics =
    estimateGroundingCost(
      response
    );

  return {
    attemptNumber,

    providerUsageMetadata:
      cloneProviderUsage(
        usageMetadata
      ),

    groundingVerification,

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
      response.candidates?.[0]
        ?.finishReason || null,

    tokenEconomics,

    groundingEconomics,

    estimatedResearchCostUsdAtPaidRate:
      roundMoney(
        tokenEconomics
          .estimatedTokenCostUsd +
        groundingEconomics
          .estimatedGroundingCostUsdAtPaidRate
      ),
  };
}

function sumAttempts(
  attempts,
  field
) {
  return attempts.reduce(
    (total, attempt) =>
      total +
      Number(
        attempt?.[field] || 0
      ),
    0
  );
}

/**
 * Aggregate all provider attempts into one request-level telemetry record.
 *
 * Raw usage remains available per attempt while the existing top-level
 * fields become request totals so T07 accounting charges every attempt.
 */
function aggregateTelemetry(
  attempts,
  historicalEvidencePacket
) {
  const finalAttempt =
    attempts[
      attempts.length - 1
    ];

  const tokenCost =
    attempts.reduce(
      (total, attempt) =>
        total +
        Number(
          attempt
            ?.tokenEconomics
            ?.estimatedTokenCostUsd || 0
        ),
      0
    );

  const groundingCost =
    attempts.reduce(
      (total, attempt) =>
        total +
        Number(
          attempt
            ?.groundingEconomics
            ?.estimatedGroundingCostUsdAtPaidRate || 0
        ),
      0
    );

  const googleSearchQueryCount =
    attempts.reduce(
      (total, attempt) =>
        total +
        Number(
          attempt
            ?.groundingEconomics
            ?.googleSearchQueryCount || 0
        ),
      0
    );

  return {
    operation:
      "initial_scan",

    model:
      MODEL_NAME,

    attemptCount:
      attempts.length,

    attempts:
      attempts.map(
        (attempt) => ({
          attemptNumber:
            attempt.attemptNumber,

          groundingVerification:
            attempt.groundingVerification,

          promptTokenCount:
            attempt.promptTokenCount,

          candidatesTokenCount:
            attempt.candidatesTokenCount,

          totalTokenCount:
            attempt.totalTokenCount,

          cachedContentTokenCount:
            attempt.cachedContentTokenCount,

          thoughtsTokenCount:
            attempt.thoughtsTokenCount,

          finishReason:
            attempt.finishReason,

          tokenEconomics:
            attempt.tokenEconomics,

          groundingEconomics:
            attempt.groundingEconomics,

          estimatedResearchCostUsdAtPaidRate:
            attempt
              .estimatedResearchCostUsdAtPaidRate,
        })
      ),

    providerUsageMetadata:
      finalAttempt
        .providerUsageMetadata,

    providerUsageMetadataAttempts:
      attempts.map(
        (attempt) =>
          attempt
            .providerUsageMetadata
      ),

    groundingVerification:
      finalAttempt
        .groundingVerification,

    promptTokenCount:
      sumAttempts(
        attempts,
        "promptTokenCount"
      ),

    candidatesTokenCount:
      sumAttempts(
        attempts,
        "candidatesTokenCount"
      ),

    totalTokenCount:
      sumAttempts(
        attempts,
        "totalTokenCount"
      ),

    cachedContentTokenCount:
      sumAttempts(
        attempts,
        "cachedContentTokenCount"
      ),

    thoughtsTokenCount:
      sumAttempts(
        attempts,
        "thoughtsTokenCount"
      ),

    finishReason:
      finalAttempt.finishReason,

    historicalContextUsed:
      Boolean(
        historicalEvidencePacket
      ),

    historicalStateCount:
      historicalEvidencePacket
        ?.stateCount || 0,

    tokenEconomics: {
      ...finalAttempt
        .tokenEconomics,

      estimatedTokenCostUsd:
        roundMoney(
          tokenCost
        ),
    },

    groundingEconomics: {
      ...finalAttempt
        .groundingEconomics,

      googleSearchQueryCount,

      estimatedGroundingCostUsdAtPaidRate:
        roundMoney(
          groundingCost
        ),
    },

    estimatedResearchCostUsdAtPaidRate:
      roundMoney(
        tokenCost +
        groundingCost
      ),
  };
}

async function analyzeImageWithGemini(
  apiKey,
  cleanBase64,
  mimeType,
  prompt,
  historicalEvidencePacket = null
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

  const genAI =
    new GoogleGenerativeAI(
      apiKey
    );

  const model =
    genAI.getGenerativeModel({
      model:
        MODEL_NAME,

      systemInstruction:
        SYSTEM_PROMPT,

      tools: [
        {
          googleSearch: {},
        },
      ],

      generationConfig: {
        responseMimeType:
          "application/json",

        responseSchema:
          RESPONSE_SCHEMA,

        temperature:
          0.2,

        maxOutputTokens:
          7000,
      },
    });

  const imagePart = {
    inlineData: {
      data:
        cleanBase64,

      mimeType:
        mimeType ||
        "image/jpeg",
    },
  };

  const basePrompt =
    prompt ||
    `Identify the primary solicitation in this image, reconstruct the target and CTA, complete the grounded web crawl, compile the empirical evidence, classify the target, derive all six vectors, identify applicable Action Meter context signals and confirmed Floor Raisers, and return the complete diagnostic report JSON.

For solicitation recognition, describe the solicitation pattern independently of confirmed actor identity.

UNKNOWN ACTOR does not mean UNKNOWN SOLICITATION.

Do not treat similar patterns as proof of the same actor.

Do not generate Deep Dive.`;

  const groundedBasePrompt =
    `${basePrompt}\n${MANDATORY_GROUNDING_INSTRUCTION}`;

  const promptToExecute =
    buildHistoricalResearchPrompt(
      groundedBasePrompt,
      historicalEvidencePacket
    );

  const attempts = [];

  async function runAttempt(
    requestPrompt,
    attemptNumber
  ) {
    const result =
      await model.generateContent([
        requestPrompt,
        imagePart,
      ]);

    const telemetry =
      buildAttemptTelemetry(
        result.response,
        attemptNumber
      );

    attempts.push(
      telemetry
    );

    return result.response;
  }

  let acceptedResponse =
    await runAttempt(
      promptToExecute,
      1
    );

  if (
    !attempts[0]
      .groundingVerification
      .verified
  ) {
    acceptedResponse =
      await runAttempt(
        `${promptToExecute}\n${GROUNDING_RETRY_INSTRUCTION}`,
        2
      );
  }

  const telemetry =
    aggregateTelemetry(
      attempts,
      historicalEvidencePacket
    );

  const finalVerification =
    telemetry
      .groundingVerification;

  /*
   * Both attempts may consume provider resources.
   * If grounding still fails, reject before parsing, scoring, persistence,
   * solicitation history, or Cache Bank admission.
   */
  if (
    !finalVerification
      .verified
  ) {
    const error =
      new HttpsError(
        "failed-precondition",
        "411 could not establish live web grounding after the allowed retry. No diagnostic intelligence was accepted."
      );

    error.groundingRejected =
      true;

    error.scanTelemetry =
      telemetry;

    throw error;
  }

  const rawText =
    acceptedResponse.text();

  const parsedData =
    safeParseGeminiJson(
      rawText
    );

  parsedData.solicitation_pattern =
    normalizeSolicitationPattern(
      parsedData
        .solicitation_pattern
    );

  /*
   * Replace model-proposed Technical 411 source authority with
   * provider-grounded evidence before scoring or persistence.
   */
  normalizeTechnicalEvidence(
    parsedData,
    finalVerification.sources
  );

  const floorRaisers =
    extractFloorRaisers(
      parsedData
    );

  const score =
    calculateScore(
      parsedData,
      floorRaisers
    );

  const verdict =
    getVerdict(
      score
    );

  parsedData
    .consumer_card
    .action_meter_score =
      score;

  parsedData
    .consumer_card
    .action_verdict_badge =
      verdict.badge;

  parsedData
    .consumer_card
    .verdict_label =
      verdict.label;

  const historicalAppendix =
    historicalEvidencePacket &&
    promptToExecute.startsWith(
      groundedBasePrompt
    )
      ? promptToExecute.slice(
          groundedBasePrompt.length
        )
      : "";

  const composition =
    measureScanComposition({
      inputTextParts: {
        systemPrompt:
          SYSTEM_PROMPT,

        requestPrompt:
          groundedBasePrompt,

        historicalAppendix,
      },

      report:
        parsedData,
    });

  return {
    report:
      parsedData,

    telemetry,

    composition,
  };
}

module.exports = {
  analyzeImageWithGemini,
};

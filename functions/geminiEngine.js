/**
 * @file functions/geminiEngine.js
 * @class Class 5
 * @cap 600 Lines
 * @responsibility Execute two-pass grounded Gemini investigations (Pass 1:
 *   unconstrained research with Google Search Grounding; Pass 2: structured
 *   JSON synthesis from the research dossier), retry one ungrounded Pass 1
 *   attempt, aggregate request economics, validate Technical 411 evidence,
 *   and finalize the server-owned report.
 * @architecture Two-pass pipeline resolves the documented Gemini API
 *   limitation where responseMimeType + responseSchema on the same call as
 *   googleSearch throttles search depth from 3-8 queries to 0-1 (Gemini
 *   Cookbook Issue #1274). Pass 1 runs search unconstrained; Pass 2 runs
 *   schema compliance without search tools.
 * @dependencies @google/generative-ai, firebase-functions/v2/https,
 *               ./prompt, ./geminiResponseSchema, ./geminiReportParser,
 *               ./solicitationPattern, ./actionMeter,
 *               ./historicalPromptContext, ./tokenCostEstimator,
 *               ./groundingCostEstimator, ./groundingVerification,
 *               ./technicalLedgerEvidence, ./scanCompositionMeter
 * @security_gate Fresh intelligence cannot reach scoring, persistence, or
 *   Cache Bank admission unless Pass 1 provider metadata proves live Google
 *   Search grounding and grounded web sources. Pass 2 never fires if Pass 1
 *   grounding fails.
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

/**
 * Pass 1 output directive. Forces prose evidence dossier instead of JSON
 * so the model's full search-query generation budget is available.
 */
const RESEARCH_OUTPUT_INSTRUCTION = `
OUTPUT FORMAT FOR THIS PASS:
Return your findings as a detailed factual research dossier in PLAIN TEXT.
Do NOT return JSON. Do NOT structure output as a response schema.

Cover every evidence category relevant to the six diagnostic vectors:
- Target identity and official destination
- Business model, pricing, and monetization mechanics
- BBB listing, rating, and complaint history
- FTC enforcement actions, advisories, or consumer warnings
- State business registrations and regulatory actions
- Trustpilot review profile, rating counts, and complaint patterns
- App Store / Google Play Store review metrics and developer identity
- WHOIS domain registration history and registrar details
- Complaint patterns, regulatory sanctions, and legal actions
- Ad delivery mechanics, dark patterns, and friction traps
- Data collection scope and third-party sharing

If a source yields no results, state that explicitly rather than omitting it.

MANDATORY ALTERNATIVES DISCOVERY (ACTION METER 5.6+):
If the target shows significant risk factors suggesting an Action Meter score of 5.6 or above (crypto participation, predatory mechanics, high financial risk, deceptive practices, aggressive data collection, ad-farm patterns, or phantom balance schemes), you MUST actively search for 2 to 3 legitimate alternatives in the same category.

For each alternative found, include:
- The real name of the alternative
- A real destination URL (Google Play Store link, Apple App Store link, or official website URL)
- Why it is a relevant alternative for the user

Use category-level Google searches such as "best [category] app", "legitimate [category] alternative", or "[category] top rated app" to find real alternatives with real URLs.

Do NOT skip this step on high-risk targets. Do NOT return zero alternatives when the target scores 5.6 or above.
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
  attemptNumber,
  passLabel
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

    passLabel:
      passLabel || "research",

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
      "initial_scan_two_pass",

    model:
      MODEL_NAME,

    attemptCount:
      attempts.length,

    attempts:
      attempts.map(
        (attempt) => ({
          attemptNumber:
            attempt.attemptNumber,

          passLabel:
            attempt.passLabel,

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
  historicalEvidencePacket = null,
  linkEvidence = null
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

  /*
   * ================================================================
   * PASS 1 MODEL — Unconstrained prose + Google Search Grounding.
   * No responseMimeType or responseSchema so the model's full
   * search-query generation budget is available (3-8+ queries).
   * ================================================================
   */
  const researchModel =
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
        temperature:
          1.0,

        maxOutputTokens:
          8192,
      },
    });

  /*
   * ================================================================
   * PASS 2 MODEL — Structured JSON synthesis from Pass 1 dossier.
   * No search tools attached; operates entirely on grounded evidence
   * collected in Pass 1.
   * ================================================================
   */
  const synthesisModel =
    genAI.getGenerativeModel({
      model:
        MODEL_NAME,

      systemInstruction:
        SYSTEM_PROMPT,

      generationConfig: {
        responseMimeType:
          "application/json",

        responseSchema:
          RESPONSE_SCHEMA,

        temperature:
          0.1,

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
    `Identify the primary solicitation in this image, reconstruct the target and CTA, complete the grounded web crawl, compile the empirical evidence, classify the target, and build a complete factual evidence dossier.

For solicitation recognition, describe the solicitation pattern independently of confirmed actor identity.

UNKNOWN ACTOR does not mean UNKNOWN SOLICITATION.

Do not treat similar patterns as proof of the same actor.

Do not generate Deep Dive.`;

  /*
   * Inject deterministic link-resolution evidence when available.
   * This gives Pass 1 redirect-chain facts before grounded search,
   * so low-footprint targets get destination evidence even when
   * Google has nothing indexed.
   */
  const linkEvidenceBlock =
    linkEvidence &&
    Array.isArray(linkEvidence.links) &&
    linkEvidence.links.length > 0
      ? `\nDETERMINISTIC LINK RESOLUTION EVIDENCE:\n${
          linkEvidence.links
            .map((link) => {
              const hops =
                link.hops && link.hops.length > 0
                  ? link.hops
                      .map(
                        (hop) =>
                          `  ${hop.from} → ${hop.to} (${hop.status})`
                      )
                      .join("\n")
                  : "  (no redirects)";

              return (
                `Submitted: ${link.submittedUrl}\n` +
                `Final: ${link.finalUrl}\n` +
                `Domain: ${link.finalDomain || "unknown"}\n` +
                `Path: ${link.finalPath || "/"}\n` +
                `HTTP: ${link.httpStatus || "unknown"}\n` +
                `Redirect chain:\n${hops}` +
                (link.error
                  ? `\nError: ${link.error}`
                  : "")
              );
            })
            .join("\n---\n")
        }\n`
      : "";

  const groundedBasePrompt =
    `${basePrompt}\n${MANDATORY_GROUNDING_INSTRUCTION}\n${linkEvidenceBlock}${RESEARCH_OUTPUT_INSTRUCTION}`;

  const promptToExecute =
    buildHistoricalResearchPrompt(
      groundedBasePrompt,
      historicalEvidencePacket
    );

  /*
   * ================================================================
   * PASS 1 — Grounded research with retry.
   * Grounding gate enforced here: if both attempts fail verification,
   * the request is rejected before Pass 2 fires.
   * ================================================================
   */
  const researchAttempts = [];

  async function runResearchAttempt(
    requestPrompt,
    attemptNumber
  ) {
    const result =
      await researchModel.generateContent([
        requestPrompt,
        imagePart,
      ]);

    const telemetry =
      buildAttemptTelemetry(
        result.response,
        attemptNumber,
        "research"
      );

    researchAttempts.push(
      telemetry
    );

    return result.response;
  }

  let researchResponse =
    await runResearchAttempt(
      promptToExecute,
      1
    );

  if (
    !researchAttempts[0]
      .groundingVerification
      .verified
  ) {
    researchResponse =
      await runResearchAttempt(
        `${promptToExecute}\n${GROUNDING_RETRY_INSTRUCTION}`,
        2
      );
  }

  const pass1FinalVerification =
    researchAttempts[
      researchAttempts.length - 1
    ].groundingVerification;

  /*
   * Both attempts may consume provider resources.
   * If grounding still fails, reject before Pass 2, parsing, scoring,
   * persistence, solicitation history, or Cache Bank admission.
   */
  if (
    !pass1FinalVerification
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
      aggregateTelemetry(
        researchAttempts,
        historicalEvidencePacket
      );

    throw error;
  }

  const researchDossier =
    researchResponse.text();

  /*
   * ================================================================
   * PASS 2 — Schema synthesis from grounded dossier.
   * Receives the full Pass 1 research text plus the original image.
   * No search tools: all evidence comes from the dossier.
   * ================================================================
   */
  const synthesisPrompt =
    `Based on the image provided and the grounded research dossier below, compile the complete structured JSON diagnostic report.

GROUNDED RESEARCH DOSSIER:
${researchDossier}

Instructions:
- Use the research dossier as your primary evidence source for all claims.
- Do not invent or hallucinate facts not present in the dossier or visible in the image.
- If a fact was not established in the dossier, mark the field as not researched, not found, or not applicable as appropriate.
- Complete all JSON fields according to the response schema.
- Derive all six risk vectors from the evidence in the dossier.
- Identify applicable Action Meter context signals and confirmed Floor Raisers.
- Populate alternatives.discovery_items using only real alternatives found in the research dossier. Each entry needs a real name, a real destination_url from the dossier, a relationship type (comparative, complementary, or adjacent), and a one-line description. For high-risk targets (Action Meter 8.0+), prioritize safer alternatives when they appear in the dossier. If the dossier contains no alternatives, return an empty discovery_items array rather than inventing entries.
- For solicitation recognition, describe the solicitation pattern independently of confirmed actor identity.`;

  const synthesisResult =
    await synthesisModel
      .generateContent([
        synthesisPrompt,
        imagePart,
      ]);

  const synthesisResponse =
    synthesisResult.response;

  const pass2Telemetry =
    buildAttemptTelemetry(
      synthesisResponse,
      researchAttempts.length + 1,
      "synthesis"
    );

  /*
   * ================================================================
   * TELEMETRY AGGREGATION
   * All Pass 1 research attempts + Pass 2 synthesis attempt.
   * Grounding verification overridden to Pass 1's verified result
   * since Pass 2 has no search tools.
   * ================================================================
   */
  const allAttempts = [
    ...researchAttempts,
    pass2Telemetry,
  ];

  const telemetry =
    aggregateTelemetry(
      allAttempts,
      historicalEvidencePacket
    );

  telemetry.groundingVerification =
    pass1FinalVerification;

  /*
   * ================================================================
   * REPORT PARSING & EVIDENCE NORMALIZATION
   * Same pipeline as single-pass: parse JSON, normalize pattern,
   * bind grounded evidence, score, verdict.
   * ================================================================
   */
  const rawText =
    synthesisResponse.text();

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
   * provider-grounded evidence from Pass 1 before scoring or
   * persistence.
   */
  normalizeTechnicalEvidence(
    parsedData,
    pass1FinalVerification.sources
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
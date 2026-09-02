/**
 * @file functions/geminiEngine.js
 * @class Class 5
 * @cap 500 lines
 * @responsibility Execute grounded Gemini scans, parse reports, calculate Action Meter, and generate on-demand Deep Dive.
 * @dependencies @google/generative-ai, firebase-functions/v2/https, ./prompt
 * @security_gate Server owns final score; model output never controls the final Action Meter.
 * @owner_context 411 Scanner diagnostic engine
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");
const { HttpsError } = require("firebase-functions/v2/https");
const { SYSTEM_PROMPT } = require("./prompt");

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    consumer_card: {
      type: "object",
      properties: {
        target_name: { type: "string" },
        developer_or_entity: { type: "string" },
        interface_surface: { type: "string" },
        classification_badges: {
          type: "array",
          items: { type: "string" }
        },
        metrics: {
          type: "object",
          properties: {
            financial_risk: { type: "integer" },
            personal_data_exposure: { type: "integer" },
            wasted_time_and_ads: { type: "integer" },
            real_substance: { type: "integer" },
            offline_independence: { type: "integer" },
            honest_pricing: { type: "integer" }
          },
          required: [
            "financial_risk",
            "personal_data_exposure",
            "wasted_time_and_ads",
            "real_substance",
            "offline_independence",
            "honest_pricing"
          ]
        },
        metric_annotations: {
          type: "object",
          properties: {
            financial_risk_note: { type: "string" },
            personal_data_note: { type: "string" },
            wasted_time_note: { type: "string" },
            real_substance_note: { type: "string" },
            offline_independence_note: { type: "string" },
            honest_pricing_note: { type: "string" }
          },
          required: [
            "financial_risk_note",
            "personal_data_note",
            "wasted_time_note",
            "real_substance_note",
            "offline_independence_note",
            "honest_pricing_note"
          ]
        },
        action_meter_score: { type: "number" },
        action_verdict_badge: { type: "string" },
        verdict_label: { type: "string" },
        tagline: { type: "string" },
        essential_411: { type: "string" },
        secondary_targets_note: { type: "string" },
        floor_raisers: {
          type: "object",
          properties: {
            rebrand_pattern: { type: "boolean" },
            advance_fee: { type: "boolean" },
            federal_impersonation: { type: "boolean" },
            confirmed_criminal: { type: "boolean" },
            near_threshold_suspension: { type: "boolean" },
            withdrawal_gate: { type: "boolean" }
          },
          required: [
            "rebrand_pattern",
            "advance_fee",
            "federal_impersonation",
            "confirmed_criminal",
            "near_threshold_suspension",
            "withdrawal_gate"
          ]
        }
      },
      required: [
        "target_name",
        "developer_or_entity",
        "interface_surface",
        "classification_badges",
        "metrics",
        "metric_annotations",
        "action_meter_score",
        "action_verdict_badge",
        "verdict_label",
        "tagline",
        "essential_411"
      ]
    },
    technical_ledger: {
      type: "object",
      properties: {
        network_telemetry: {
          type: "object",
          properties: {
            app_package_or_domain: { type: "string" },
            host_cdn: { type: "string" },
            domain_age_days: { type: "integer", nullable: true },
            tls_certificate_status: { type: "string", nullable: true },
            grounding_sources: {
              type: "array",
              items: { type: "string" }
            }
          },
          required: [
            "app_package_or_domain",
            "host_cdn",
            "grounding_sources"
          ]
        },
        monetization: {
          type: "object",
          properties: {
            revenue_model: { type: "string" },
            pricing: { type: "string" },
            affiliate_disclosure: { type: "string" },
            guarantee_terms: { type: "string" }
          },
          required: [
            "revenue_model",
            "pricing",
            "affiliate_disclosure",
            "guarantee_terms"
          ]
        },
        regulatory_record: {
          type: "object",
          properties: {
            license_status: { type: "string" },
            bbb_record: { type: "string" },
            ftc_record: { type: "string" },
            complaint_pattern: { type: "string" },
            review_spread: { type: "string" }
          },
          required: [
            "license_status",
            "bbb_record",
            "ftc_record",
            "complaint_pattern",
            "review_spread"
          ]
        },
        technical_flags: {
          type: "array",
          items: { type: "string" }
        }
      },
      required: [
        "network_telemetry",
        "monetization",
        "regulatory_record",
        "technical_flags"
      ]
    },
    alternatives: {
      type: "object",
      properties: {
        renders: { type: "boolean" },
        verified_links: {
          type: "object",
          properties: {
            official_site: { type: "string" },
            real_phone: { type: "string" },
            real_email: { type: "string" }
          }
        },
        recommended_alternatives: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              score_estimate: { type: "string" },
              description: { type: "string" }
            }
          }
        },
        community_tags: {
          type: "array",
          items: { type: "string" }
        }
      },
      required: [
        "renders",
        "recommended_alternatives",
        "community_tags"
      ]
    }
  },
  required: [
    "consumer_card",
    "technical_ledger",
    "alternatives"
  ]
};

function calculateScore(metrics, floorRaisers = {}) {
  const frictionAvg =
    (
      metrics.financial_risk +
      metrics.personal_data_exposure +
      metrics.wasted_time_and_ads
    ) / 3;

  const riskScore = 10 - frictionAvg;

  const substanceScore =
    (
      metrics.real_substance +
      metrics.offline_independence +
      metrics.honest_pricing
    ) / 3;

  let score = (riskScore + substanceScore) / 2;

  if (floorRaisers.rebrandPattern) score += 1.0;
  if (floorRaisers.advanceFee) score += 1.0;
  if (floorRaisers.federalImpersonation) score += 1.5;
  if (floorRaisers.confirmedCriminal) score += 2.0;
  if (floorRaisers.nearThresholdSuspension) score += 0.5;
  if (floorRaisers.withdrawalGate) score += 0.5;

  return Math.min(10.0, Math.round(score * 10) / 10);
}

function getVerdict(score) {
  if (score <= 2.9) {
    return { badge: "SOLID_APP", label: "SOLID APP" };
  }

  if (score <= 4.9) {
    return {
      badge: "MOSTLY_FOR_EVERYONE",
      label: "MOSTLY FOR EVERYONE"
    };
  }

  if (score <= 5.5) {
    return { badge: "YOUR_TRIBE", label: "YOUR TRIBE" };
  }

  if (score <= 5.9) {
    return {
      badge: "YOUR_TRIBE_PROCEED_CAREFULLY",
      label: "YOUR TRIBE, PROCEED CAREFULLY"
    };
  }

  if (score <= 6.9) {
    return {
      badge: "HIGH_FRICTION_FUNNEL",
      label: "HIGH FRICTION FUNNEL"
    };
  }

  if (score <= 7.9) {
    return {
      badge: "PROFESSIONAL_CONSIDERATION_ONLY",
      label: "PROFESSIONAL CONSIDERATION ONLY"
    };
  }

  if (score <= 8.9) {
    return {
      badge: "DELETE_FROM_DEVICE",
      label: "DELETE FROM DEVICE"
    };
  }

  if (score <= 9.9) {
    return {
      badge: "DELETE_FROM_PLAY_STORE",
      label: "DELETE FROM PLAY STORE"
    };
  }

  return {
    badge: "DELETE_FROM_EARTH",
    label: "DELETE FROM EARTH"
  };
}

function safeParseGeminiJson(rawText) {
  let text = (rawText || "").trim();

  if (text.startsWith("```")) {
    text = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");
  }

  try {
    return JSON.parse(text);
  } catch (firstError) {
    console.error(
      "411 Scanner raw Gemini response (parse failed):",
      text.substring(0, 800)
    );
    console.error("411 Scanner parse error:", firstError.message);

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

function extractFloorRaisers(parsedData) {
  const source = parsedData.consumer_card.floor_raisers || {};

  return {
    rebrandPattern: source.rebrand_pattern === true,
    advanceFee: source.advance_fee === true,
    federalImpersonation: source.federal_impersonation === true,
    confirmedCriminal: source.confirmed_criminal === true,
    nearThresholdSuspension:
      source.near_threshold_suspension === true,
    withdrawalGate: source.withdrawal_gate === true
  };
}

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

  const genAI = new GoogleGenerativeAI(apiKey);

  const model = genAI.getGenerativeModel({
    model: "gemini-3.6-flash",
    systemInstruction: SYSTEM_PROMPT,
    tools: [
      {
        googleSearch: {}
      }
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.2,
      maxOutputTokens: 7000
    }
  });

  const imagePart = {
    inlineData: {
      data: cleanBase64,
      mimeType: mimeType || "image/jpeg"
    }
  };

  const promptToExecute =
    prompt ||
    `Identify the primary solicitation in this image, reconstruct the target and CTA, complete the grounded web crawl, compile the empirical evidence, classify the target, derive all six risk factors from that evidence, identify any confirmed floor raisers, and return the complete diagnostic report JSON. Do not generate Deep Dive.`;

  const result = await model.generateContent([
    promptToExecute,
    imagePart
  ]);

  const rawText = result.response.text();
  const parsedData = safeParseGeminiJson(rawText);
  const usageMetadata = result.response.usageMetadata || {};

  const telemetry = {
    operation: "initial_scan",
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

  const floorRaisers = extractFloorRaisers(parsedData);

  const score = calculateScore(
    parsedData.consumer_card.metrics,
    floorRaisers
  );

  const verdict = getVerdict(score);

  parsedData.consumer_card.action_meter_score = score;
  parsedData.consumer_card.action_verdict_badge = verdict.badge;
  parsedData.consumer_card.verdict_label = verdict.label;

  parsedData.alternatives.renders = score >= 5.6;

  return {
    report: parsedData,
    telemetry
  };
}

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

  return result.response.text();
}

module.exports = {
  analyzeImageWithGemini,
  generateDeepDive
};
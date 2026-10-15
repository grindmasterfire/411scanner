/**
 * @file functions/deepDiveEngine.js
 * @class Class 5
 * @cap 500 lines
 * @responsibility Execute the Gemini Deep Dive: fresh Google Search grounded research beyond the base report.
 * @dependencies @google/generative-ai, firebase-functions/v2/https, groundingVerification, technicalLedgerEvidence
 * @security_gate Deep Dive uses the existing completed report as context only and does not establish identity.
 * @owner_context 411 Scanner diagnostic engine
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");
const { HttpsError } = require("firebase-functions/v2/https");
const { estimateGroundingCost } = require("./groundingCostEstimator");
const {
  buildGroundingVerification,
  mergeGroundingVerifications,
} = require("./groundingVerification");
const { resolveGroundedSources } = require("./technicalLedgerEvidence");
const { DEEP_DIVE_STANDARD } = require("./deepDiveCacheLayer");

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
3. Every factual claim must cite a source found in this research, named by its page title or site name. Do not write URLs anywhere; the source links are attached from the search results automatically. No unsourced assertions. If you cannot source a claim, leave it out.
4. Do not rely on prior model knowledge for facts. If a fact did not come from this research, do not state it.
5. Do not re-score the target, recalculate any risk score, or restate the verdict.
6. If the research turns up nothing new, say exactly: "No new findings beyond the base report."

FORMAT

Use these four sections in this order. Write each label on its own line, in capitals, exactly as shown, with no markdown symbols:

FINDING
One or two sentences naming the specific question you investigated. Choose the single most consequential open question the base report raises. Do not recap the base report.

INVESTIGATION
The new evidence, as plain narrative prose. Quote complaints and terms directly where you found them.

TIMELINE
When the new evidence appeared and how it has evolved, with dates.

OPTIONS
What the user can concretely do, grounded in the evidence you found: verification steps, recourse channels, regulators to contact, alternatives.

Do not write a SOURCES section. It is added from the search results.

STYLE

Cold forensic voice. Plain prose within sections. No em-dashes. About 2000 words at most.`;

/*
 * Pattern Deep Dive (fire ruling 2026-10-15). When the actor can't be
 * named (a compromised mailbox, a throwaway domain), the intelligence the
 * user paid for is the scam pattern itself: how it works, its history,
 * what to do, and who helps victims.
 */
const PATTERN_DEEP_DIVE_SYSTEM_PROMPT = `You are the 411 Scanner Deep Dive investigator.

The base scan identified a scam pattern whose operator cannot be named (for example a compromised mailbox or a throwaway domain). Research the PATTERN with Google Search: what is publicly known about this kind of scam and this campaign. Do not restate the base report.

RULES

1. Every factual claim must come from this research, named by its page title or site name. Do not write URLs anywhere; the source links are attached from the search results automatically. If you cannot source a claim, leave it out.
2. Do not rely on prior model knowledge for facts.
3. Do not re-score the target or restate the verdict.
4. Never send the user to any party that offers to recover lost money for a fee: recovery scams target victims of this exact kind. Say so.

FORMAT

Use these sections in this order. Write each label on its own line, in capitals, exactly as shown, with no markdown symbols:

HOW THIS SCAM WORKS
The mechanics step by step: the lure, what happens on click or reply, and what the scammer ultimately takes (credentials, money, device access, contacts).

HISTORY AND VARIANTS
When this pattern appeared, how it has evolved, known campaigns and wordings, and any reported numbers (FTC, FBI IC3, national fraud agencies, security researchers), with dates.

IF YOU ALREADY ENGAGED
Concrete steps for someone who clicked, replied, logged in, downloaded, or paid: what to change, who to call, what to watch for.

SUPPORT AND REPORTING
Two parts, both required. Where to report this pattern (agency, platform, or email provider abuse channels). Then victim support: real support groups, helplines, and nonprofit organizations that help people targeted by this kind of scam, by name. If the findings name none, run Google Search for them before writing this section.

Do not write a SOURCES section. It is added from the search results.

STYLE

Plain, calm, direct voice for someone who may have just been targeted. No em-dashes. About 2000 words at most.`;

const SOURCES_LABEL = "SOURCES";

/*
 * SOURCES comes from Google Search grounding, never from the model's text.
 * Any SOURCES section the model wrote anyway is cut off, and the section is
 * rebuilt from the provider's grounding chunks (redirects resolved to the
 * real page; a redirect that would not resolve is kept, it still leads there).
 * Format matches what the app renders: one "title - URL" per line.
 */
function withGroundedSources(text, sources = []) {
  const lines = String(text || "").split("\n");
  const cut = lines.findIndex((line) => line.trim().toUpperCase() === SOURCES_LABEL);
  const body = (cut >= 0 ? lines.slice(0, cut) : lines).join("\n").trimEnd();

  const seen = new Set();
  const entries = [];
  for (const source of sources) {
    const url = typeof source?.uri === "string" ? source.uri.trim() : "";
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const title = typeof source?.title === "string" ? source.title.trim() : "";
    entries.push(title ? `${title} - ${url}` : url);
  }

  const list = entries.length
    ? entries.join("\n")
    : "No search sources were returned for this research.";
  return `${body}\n\n${SOURCES_LABEL}\n${list}`;
}

/**
 * @param options.patternMode research the scam pattern, not an operator
 * @param options.priorFile the Cache Bank's existing file on this pattern
 */
const DEEP_DIVE_MODEL = "gemini-3.6-flash";
const MAX_SEARCH_ATTEMPTS = 3;

/*
 * Search-first (same fix as the scan's Pass 1A): a long prompt made
 * Gemini skip Google Search and write from memory while citing sources
 * (Natasha Briscoe pattern dive, 10/15: 0 searches). A short search-only
 * call gathers live findings; the Deep Dive is written from them.
 */
const SEARCH_SYSTEM_PROMPT =
  "You are a live web researcher for a consumer-protection scanner. " +
  "Use Google Search before you answer. Report only what the search " +
  "results say, naming the source of each fact.";

function searchRequest(report, targetName, patternMode) {
  const identity = report.solicitationIdentity || {};
  const pattern = report.solicitationPattern || {};
  if (patternMode) {
    const what = [identity.canonical_name, pattern.solicitation_type, pattern.offer_or_request]
      .filter(Boolean).join("; ").slice(0, 400);
    return `Research this scam pattern: ${what || targetName}. Find how it works, its history and variants, reported numbers, what victims should do, where to report it, and victim support groups, helplines, and nonprofits.`;
  }
  const who = [targetName, identity.operator, identity.destination_domain]
    .filter(Boolean).join(", ").slice(0, 300);
  return `Research ${who}: consumer complaints, regulatory or enforcement actions, court cases, forum and Reddit threads, fees, payout and contract terms.`;
}

function searchDirective(attempt) {
  return `RUN GOOGLE SEARCH NOW. Search before writing anything. [attempt ${attempt}-${Date.now().toString(36)}]`;
}

function addUsage(total, response) {
  const u = response.usageMetadata || {};
  for (const k of ["promptTokenCount", "candidatesTokenCount", "totalTokenCount", "cachedContentTokenCount", "thoughtsTokenCount"]) {
    total[k] = (total[k] || 0) + (u[k] || 0);
  }
  const g = estimateGroundingCost(response);
  total.googleSearchQueryCount = (total.googleSearchQueryCount || 0) + g.googleSearchQueryCount;
  total.groundingCostUsd = (total.groundingCostUsd || 0) + g.estimatedGroundingCostUsdAtPaidRate;
  total.groundingRateVersion = g.pricing.rateVersion;
}

/**
 * @param options.patternMode research the scam pattern, not an operator
 * @param options.priorFile the Cache Bank's existing file on this pattern
 */
async function generateDeepDive(
  apiKey,
  originalReport,
  targetName,
  { patternMode = false, priorFile = null } = {}
) {
  if (!apiKey) {
    throw new HttpsError(
      "failed-precondition",
      "GEMINI_API_KEY is not configured."
    );
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const usage = {};

  // 1. Search-first: short prompt, retried until it actually searches.
  const searchModel = genAI.getGenerativeModel({
    model: DEEP_DIVE_MODEL,
    systemInstruction: SEARCH_SYSTEM_PROMPT,
    tools: [{ googleSearch: {} }],
    generationConfig: { temperature: 1.0, maxOutputTokens: 4096 },
  });
  const request = searchRequest(originalReport || {}, targetName, patternMode);
  let searchResponse = null;
  for (let attempt = 1; attempt <= MAX_SEARCH_ATTEMPTS; attempt++) {
    const r = await searchModel.generateContent([request, searchDirective(attempt)]);
    addUsage(usage, r.response);
    searchResponse = r.response;
    if (buildGroundingVerification(r.response).verified) break;
  }
  const searchGrounded = buildGroundingVerification(searchResponse).verified;
  const findings = searchGrounded ? searchResponse.text() : "";

  // 2. Write the Deep Dive from the live findings.
  const model = genAI.getGenerativeModel({
    model: DEEP_DIVE_MODEL,
    systemInstruction: patternMode ? PATTERN_DEEP_DIVE_SYSTEM_PROMPT : DEEP_DIVE_SYSTEM_PROMPT,
    tools: [{ googleSearch: {} }],
    generationConfig: {
      temperature: 1.0,
      maxOutputTokens: 16000
    }
  });

  const priorBlock = priorFile && priorFile.text
    ? `\n\nThe 411 Cache Bank already has a file on this pattern (from ${Number(priorFile.diveCount) || 1} earlier Deep Dive(s)). Start from it, verify it against today's search results, and add what is new:\n${String(priorFile.text).slice(0, 12000)}`
    : "";

  const findingsBlock = findings
    ? `\n\nLIVE SEARCH FINDINGS (Google Search results gathered moments ago):\n${findings}\n\nWrite the Deep Dive from these live findings. Run more Google searches for anything they do not cover.`
    : "\n\nNo live search findings came back. Run Google Search now; write only what that research supports, and say plainly if it found nothing.";

  const prompt = `Target: "${targetName}"

Base report (context only; do not restate any of it):
${JSON.stringify(originalReport)}${priorBlock}${findingsBlock}`;

  const result = await model.generateContent(prompt);
  addUsage(usage, result.response);

  const telemetry = {
    operation: patternMode ? "deep_dive_pattern" : "deep_dive",
    deepDiveStandard: DEEP_DIVE_STANDARD,
    model: DEEP_DIVE_MODEL,
    promptTokenCount: usage.promptTokenCount || 0,
    candidatesTokenCount: usage.candidatesTokenCount || 0,
    totalTokenCount: usage.totalTokenCount || 0,
    cachedContentTokenCount: usage.cachedContentTokenCount || 0,
    thoughtsTokenCount: usage.thoughtsTokenCount || 0,
    googleSearchQueryCount: usage.googleSearchQueryCount || 0,
    groundingCostUsd: usage.groundingCostUsd || 0,
    groundingRateVersion: usage.groundingRateVersion || null,
    searchFirstGrounded: searchGrounded,
    finishReason:
      result.response.candidates?.[0]?.finishReason || null
  };

  // SOURCES: the search-first pass and the writing pass, merged.
  const merged = mergeGroundingVerifications([
    buildGroundingVerification(searchResponse),
    buildGroundingVerification(result.response),
  ]);
  const groundedSources = await resolveGroundedSources(merged.sources);

  return {
    text: withGroundedSources(result.response.text(), groundedSources),
    telemetry
  };
}

module.exports = {
  generateDeepDive,
  withGroundedSources,
};

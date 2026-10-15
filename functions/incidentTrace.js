/**
 * @file functions/incidentTrace.js
 * @class Class 1
 * @cap 80 lines
 * @responsibility Record one model call, exactly as sent and received, for
 *   the Incident Ledger: the system prompt, the user parts (text verbatim;
 *   the image by reference), the raw response text, grounding, and usage.
 * @dependencies None.
 * @security_gate Records only; never alters a request or a response.
 */

function partsOf(parts) {
  return (Array.isArray(parts) ? parts : [parts]).map((p) => {
    if (typeof p === "string") return { text: p };
    if (p && p.inlineData) return { image: "specimen", mimeType: p.inlineData.mimeType || null };
    if (p && typeof p.text === "string") return { text: p.text };
    return { other: true };
  });
}

function systemPromptOf(model) {
  const si = model && model.systemInstruction;
  if (!si) return null;
  if (typeof si === "string") return si;
  return (si.parts || []).map((p) => p.text || "").join("");
}

/** Append one call to trace (no-op when trace isn't an array). */
function traceCall(trace, { model, pass, parts, response, error }) {
  if (!Array.isArray(trace)) return;
  let text = null;
  try { text = response ? response.text() : null; } catch (e) { text = null; }
  const candidate = response?.candidates?.[0] || {};
  const gm = candidate.groundingMetadata || {};
  trace.push({
    pass,
    model: model?.model || null,
    atMs: Date.now(),
    systemPrompt: systemPromptOf(model),
    parts: partsOf(parts),
    responseText: text,
    finishReason: candidate.finishReason || null,
    grounding: {
      queries: Array.isArray(gm.webSearchQueries) ? gm.webSearchQueries : [],
      sources: (gm.groundingChunks || []).map((c) => ({ uri: c?.web?.uri || null, title: c?.web?.title || null })),
    },
    usage: response?.usageMetadata || null,
    error: error ? String(error.message || error).slice(0, 500) : null,
  });
}

module.exports = { traceCall };

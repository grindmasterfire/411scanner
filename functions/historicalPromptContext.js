/**
 * @file functions/historicalPromptContext.js
 * @class Class 1
 * @cap 150 Lines
 * @responsibility Convert bounded historical evidence into guarded Gemini research context.
 * @dependencies None.
 * @security_gate Historical evidence is a lead only; Gemini must re-verify current facts, identity, Floor Raisers, metrics, and conclusions.
 * @owner_context 411 Scanner T04 historical evidence prompt boundary.
 *
 * @architecture_note
 * This module never decides whether history belongs to the current
 * solicitation. It receives an already-authorized historical packet
 * and describes exactly how Gemini may use it.
 *
 * A hard character budget prevents historical reuse from defeating
 * the token savings it is intended to create.
 */

const MAX_HISTORY_CHARS = 12000;

/**
 * Serialize as many recent historical states as fit inside the prompt
 * budget. States arrive newest-first from historicalEvidence.js.
 *
 * If even the newest state exceeds the budget, history is omitted
 * rather than slicing JSON into an invalid or misleading fragment.
 */
function serializeHistoricalEvidence(packet) {
  if (
    !packet ||
    !Array.isArray(packet.states) ||
    !packet.states.length
  ) {
    return "";
  }

  const acceptedStates = [];

  for (const state of packet.states) {
    const candidate = {
      identityKey:
        packet.identityKey,
      historicalOnly: true,
      states: [
        ...acceptedStates,
        state,
      ],
    };

    const serialized =
      JSON.stringify(candidate);

    if (
      serialized.length >
      MAX_HISTORY_CHARS
    ) {
      break;
    }

    acceptedStates.push(state);
  }

  if (!acceptedStates.length) {
    return "";
  }

  return JSON.stringify({
    identityKey:
      packet.identityKey,
    historicalOnly: true,
    stateCount:
      acceptedStates.length,
    states:
      acceptedStates,
  });
}

/**
 * Append historical research guidance to the normal current-scan
 * instruction.
 *
 * The archived material can reduce rediscovery work, but nothing in
 * it becomes current evidence merely because it was previously true.
 */
function buildHistoricalResearchPrompt(
  basePrompt,
  packet
) {
  const historicalJson =
    serializeHistoricalEvidence(
      packet
    );

  if (!historicalJson) {
    return basePrompt;
  }

  return `${basePrompt}

T04 HISTORICAL RESEARCH CONTEXT

The following material comes from previously grounded 411 Scanner research associated with a previously confirmed solicitation identity.

It is HISTORICAL CONTEXT ONLY.

Use it to identify useful leads, prior sources, aliases, infrastructure, mechanics, complaint patterns, regulatory records, pricing, and other facts worth re-checking.

Do not treat any historical statement as current merely because it appears below.

Re-verify all material facts against the submitted image and current grounded web research.

Re-establish the current solicitation identity from present evidence.

Do not copy forward an old score, verdict, metric, classification, Floor Raiser, complaint condition, pricing term, destination, regulatory condition, or conclusion.

If historical information conflicts with current evidence, current verified evidence controls.

If a historical claim cannot currently be verified, report the present uncertainty rather than silently carrying the old claim forward.

Historical evidence packet:
${historicalJson}`;
}

module.exports = {
  buildHistoricalResearchPrompt,
  serializeHistoricalEvidence,
};

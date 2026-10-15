/**
 * Incident Ledger: type tags written at scan time, and model calls recorded
 * exactly as sent and received. Run: node tests/incidentLedgerTest.js
 */
const assert = require("assert");
const { tagIncident } = require("../incidentLedger");
const { traceCall } = require("../incidentTrace");

assert.equal(tagIncident({ solicitation_pattern: { solicitation_type: "visual_prompt_injection" }, consumer_card: { action_meter_score: 8 } }), "attack");
assert.equal(tagIncident({ consumer_card: { classification_badges: ["OWASP LLM01"], action_meter_score: 9.5 } }), "attack");
assert.equal(tagIncident({ solicitation_pattern: { solicitation_type: "phishing_email" }, consumer_card: { action_meter_score: 11.5 } }), "scam");
assert.equal(tagIncident({ consumer_card: { action_meter_score: 1.8 } }), "legit");
assert.equal(tagIncident({ consumer_card: { action_meter_score: 6.2 } }), "inconclusive");
assert.equal(tagIncident(null, true), "inconclusive");
// A finding about jailbroken phones is not an attack on the scanner (myD&B).
assert.equal(tagIncident({ technical_ledger: { technical_flags: ["storefront_jailbreak_detection_bugs"] }, consumer_card: { action_meter_score: 7.9 } }), "inconclusive");

const trace = [];
const model = { model: "gemini-test", systemInstruction: { parts: [{ text: "SYSTEM PROMPT" }] } };
const response = {
  text: () => "raw answer",
  usageMetadata: { totalTokenCount: 10 },
  candidates: [{ finishReason: "STOP", groundingMetadata: { webSearchQueries: ["q1"], groundingChunks: [{ web: { uri: "https://x", title: "X" } }] } }],
};
traceCall(trace, { model, pass: "search", parts: ["Research the target.", { inlineData: { data: "AAAA", mimeType: "image/png" } }], response });
assert.deepEqual(trace[0].parts, [{ text: "Research the target." }, { image: "specimen", mimeType: "image/png" }], "text verbatim, image by reference");
assert.equal(trace[0].systemPrompt, "SYSTEM PROMPT");
assert.equal(trace[0].responseText, "raw answer");
assert.deepEqual(trace[0].grounding, { queries: ["q1"], sources: [{ uri: "https://x", title: "X" }] });
// A response whose text() throws (blocked) is still recorded.
traceCall(trace, { model, pass: "synthesis", parts: ["p"], response: { text: () => { throw new Error("blocked"); }, candidates: [{}] } });
assert.equal(trace[1].responseText, null);
traceCall(null, { model, pass: "x", parts: [], response }); // no-op without a trace
console.log("incidentLedgerTest: all passed");

/**
 * Search-first research: Pass 1A (short prompt, Google Search) is retried
 * until grounded and gates the scan; Pass 1B gets 1A's live findings; the
 * grounding of both passes is merged with chunk indices kept straight.
 * Run: node tests/searchFirstResearchTest.js
 */
const assert = require("assert");
const { runSearchFirstResearch } = require("../geminiEngine");
const { mergeGroundingVerifications } = require("../groundingVerification");

function response(text, { queries = 0, chunks = [], supports = [] } = {}) {
  return {
    text: () => text,
    usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50, totalTokenCount: 150 },
    candidates: [{
      finishReason: "STOP",
      groundingMetadata: {
        webSearchQueries: Array.from({ length: queries }, (_, i) => `q${i}`),
        groundingChunks: chunks.map(([uri, title]) => ({ web: { uri, title } })),
        groundingSupports: supports.map(([t, idx]) => ({ segment: { text: t }, groundingChunkIndices: idx })),
      },
    }],
  };
}

function model(responses) {
  const calls = [];
  return {
    calls,
    generateContent: async (parts) => {
      calls.push(parts);
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return { response: next };
    },
  };
}

const refused = () => response("From memory: it's fine.");
const grounded = response("FTC sued Acme in 2024.", {
  queries: 3,
  chunks: [["https://ftc.gov/acme", "FTC"], ["https://bbb.org/acme", "BBB"]],
  supports: [["FTC sued Acme in 2024.", [0]]],
});
const base = { imagePart: { inlineData: { data: "x", mimeType: "image/png" } }, researchPrompt: "FULL PROMPT", pause: async () => {} };

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test("1A retries until grounded, then 1B gets the live findings", async () => {
  const search = model([refused(), refused(), grounded]);
  const research = model([response("Dossier.", { queries: 1, chunks: [["https://news.example/acme", "News"]], supports: [["Acme news.", [0]]] })]);
  const out = await runSearchFirstResearch({ ...base, searchModel: search, researchModel: research });

  assert.equal(search.calls.length, 3);
  assert.ok(search.calls[0][0].length < 400, "1A prompt stays short");
  assert.ok(!search.calls[0][0].includes("FULL PROMPT"));
  assert.ok(String(search.calls[0][2]).startsWith("RUN GOOGLE SEARCH NOW"), "directive is last");

  assert.equal(research.calls.length, 1);
  assert.ok(research.calls[0][0].startsWith("FULL PROMPT"));
  assert.ok(research.calls[0][0].includes("FTC sued Acme in 2024."), "1B sees 1A findings");

  assert.ok(out.dossier.includes("Dossier.") && out.dossier.includes("FTC sued Acme in 2024."));
  assert.deepEqual(out.attempts.map((a) => a.passLabel), ["search", "search", "search", "research"]);
  assert.equal(out.verification.verified, true);
  assert.equal(out.verification.groundedSourceCount, 3);
  assert.equal(out.verification.googleSearchQueryCount, 4);
});

test("1A never grounds: rejected as model_refused with all attempts, 1B never runs", async () => {
  const search = model([refused(), refused(), refused(), refused(), refused()]);
  const research = model([]);
  await assert.rejects(
    runSearchFirstResearch({ ...base, searchModel: search, researchModel: research }),
    (e) => {
      assert.equal(e.groundingRejected, true);
      assert.equal(e.groundingCause, "model_refused");
      assert.equal(e.researchAttempts.length, 5);
      return true;
    }
  );
  assert.equal(research.calls.length, 0);
});

test("searched but no sources is labeled blink, not model_refused", async () => {
  const blink = () => response("nothing", { queries: 2 });
  const search = model([blink(), blink()]);
  await assert.rejects(
    runSearchFirstResearch({ ...base, searchModel: search, researchModel: model([]), maxSearchAttempts: 2 }),
    (e) => e.groundingCause === "blink"
  );
});

test("transient API errors retry without burning a grounding attempt", async () => {
  const search = model([new Error("503 unavailable"), grounded]);
  const out = await runSearchFirstResearch({ ...base, searchModel: search, researchModel: model([response("D")]), maxSearchAttempts: 1 });
  assert.equal(out.verification.verified, true);
});

test("target hint from the link reaches the short prompt", async () => {
  const search = model([grounded]);
  await runSearchFirstResearch({ ...base, searchModel: search, researchModel: model([response("D")]), targetHint: "Destination seen in its link: acme.com." });
  assert.ok(search.calls[0][0].includes("acme.com"));
});

test("merge offsets chunk indices and folds duplicate sources", () => {
  const a = { googleSearchQueryCount: 2, sources: [{ uri: "u1", chunkIndices: [0] }, { uri: "u2", chunkIndices: [1] }], supports: [{ text: "s1", groundingChunkIndices: [1] }] };
  const b = { googleSearchQueryCount: 1, sources: [{ uri: "u3", chunkIndices: [0] }, { uri: "u1", chunkIndices: [1] }], supports: [{ text: "s2", groundingChunkIndices: [0, 1] }] };
  const m = mergeGroundingVerifications([a, b]);
  assert.equal(m.verified, true);
  assert.equal(m.googleSearchQueryCount, 3);
  assert.deepEqual(m.sources.map((s) => s.uri), ["u1", "u2", "u3"]);
  assert.deepEqual(m.sources[0].chunkIndices, [0, 3], "u1 reachable from both passes");
  assert.deepEqual(m.sources[2].chunkIndices, [2]);
  assert.deepEqual(m.supports[1].groundingChunkIndices, [2, 3]);
  assert.equal(mergeGroundingVerifications([{ googleSearchQueryCount: 0, sources: [], supports: [] }]).verified, false);
});

(async () => {
  let passed = 0;
  for (const [name, fn] of tests) {
    try { await fn(); passed++; console.log(`  ok: ${name}`); }
    catch (e) { console.error(`  FAIL: ${name}\n    ${e.stack}`); process.exitCode = 1; }
  }
  console.log(`${passed}/${tests.length} passed`);
})();

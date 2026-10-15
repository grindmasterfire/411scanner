/**
 * Deep Dive SOURCES: built from Google Search grounding, never from the
 * model's own text. Run: node tests/deepDiveSourcesTest.js
 */
const assert = require("assert");
const { withGroundedSources } = require("../deepDiveEngine");

const BODY = "FINDING\nA question.\n\nINVESTIGATION\nEvidence.\n\nOPTIONS\nSteps.";

// The model's SOURCES section is dropped and replaced by grounded links.
{
  const modelText = `${BODY}\n\nSOURCES\nMade Up Page - https://invented.example/fake`;
  const out = withGroundedSources(modelText, [
    { uri: "https://www.ftc.gov/case/123", title: "FTC case" },
    { uri: "http://forum.example.org/thread/9", title: "" },
  ]);
  assert.ok(!out.includes("invented.example"), "model URL removed");
  assert.ok(out.startsWith(BODY), "body kept as written");
  assert.ok(out.endsWith("SOURCES\nFTC case - https://www.ftc.gov/case/123\nhttp://forum.example.org/thread/9"));
}

// No model SOURCES section: grounded section is appended.
{
  const out = withGroundedSources(BODY, [{ uri: "https://a.example/x", title: "A" }]);
  assert.strictEqual(out, `${BODY}\n\nSOURCES\nA - https://a.example/x`);
}

// Duplicate URLs (several chunks resolving to one page) are listed once.
{
  const out = withGroundedSources(BODY, [
    { uri: "https://a.example/x", title: "A" },
    { uri: "https://a.example/x", title: "A again" },
  ]);
  assert.strictEqual(out.match(/a\.example\/x/g).length, 1);
}

// Label match is case-insensitive and tolerates whitespace.
{
  const out = withGroundedSources(`${BODY}\n  Sources  \nfake - https://x.example`, []);
  assert.ok(!out.includes("x.example"));
}

// No grounding: say so honestly instead of leaving model URLs.
{
  const out = withGroundedSources(`${BODY}\nSOURCES\nfake - https://x.example`, []);
  assert.ok(out.endsWith("SOURCES\nNo search sources were returned for this research."));
  assert.ok(!out.includes("x.example"));
}

console.log("deepDiveSourcesTest: all passed");

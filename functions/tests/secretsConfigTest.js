/**
 * Story 10.7: the Gemini key is bound from Secret Manager on every function
 * that calls Gemini, and model names are committed in functions/.env.scanner-4ea67.
 * Run: node tests/secretsConfigTest.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const fns = require("../index");

for (const name of ["scan", "deepDive"]) {
  const secrets = (fns[name].__endpoint.secretEnvironmentVariables || []).map((s) => s.key);
  assert.ok(secrets.includes("GEMINI_API_KEY"), `${name} binds GEMINI_API_KEY from Secret Manager`);
}
const env = fs.readFileSync(path.join(__dirname, "..", ".env.scanner-4ea67"), "utf8");
// Launch gates must live here: a gate set by hand on a service is dropped by
// the next deploy (AD_GATE_ENFORCED, 2026-10-16).
assert.match(env, /^AD_GATE_ENFORCED=true$/m, "ad gate enforced");
assert.match(env, /^PLAY_VERIFY_ENABLED=true$/m, "Play purchase verification on");
for (const key of ["PASS1_MODEL", "PASS2_MODEL", "MAX_GROUNDING_RETRIES"]) {
  assert.match(env, new RegExp(`^${key}=\\S+$`, "m"), key);
}
assert.ok(!/GEMINI_API_KEY\s*=/.test(env), "the key itself never sits in .env");
console.log("secretsConfigTest: all passed");

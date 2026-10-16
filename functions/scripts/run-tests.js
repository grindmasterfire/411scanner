/**
 * @file functions/scripts/run-tests.js
 * @responsibility `npm test`: run every offline test file in tests/
 *   (*Test.js and *Regression.js), each in its own node process, print one
 *   line per file, and exit non-zero if any fails.
 * @security_gate Local tooling only. Runs no live scans and never calls
 *   Gemini. smoke-*.js files are live smoke checks and are excluded.
 *
 * Usage: npm test            (all files)
 *        npm test -- deepDive (only files whose name contains "deepDive")
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const TESTS_DIR = path.join(__dirname, "..", "tests");
const filter = process.argv[2] || "";

const files = fs.readdirSync(TESTS_DIR)
  .filter((f) => /(Test|Regression)\.js$/.test(f) && f.includes(filter))
  .sort();

let failed = 0;
for (const file of files) {
  const run = spawnSync(process.execPath, [path.join(TESTS_DIR, file)], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf8",
    timeout: 120000,
  });
  const ok = run.status === 0;
  const output = `${run.stdout || ""}${run.stderr || ""}`.trim();
  const lastLine = (text) => String(text || "").trim().split("\n").filter(Boolean).pop() || "";
  const last = lastLine(run.stdout) || lastLine(run.stderr);
  console.log(`${ok ? "PASS" : "FAIL"}  ${file}  ${last.slice(0, 120)}`);
  if (!ok) {
    failed++;
    console.log(output.split("\n").slice(-20).map((l) => `      ${l}`).join("\n"));
  }
}

console.log(`\n${files.length - failed}/${files.length} test files passed.`);
process.exit(failed ? 1 : 0);

/**
 * 411 Scanner error code reference.
 * Maps error codes to plain-language explanations, components, and fixes.
 */
const ERROR_CODES = {
  20201: {
    title: "Scan execution failed",
    component: "scanWorkflow.js / executeScan",
    meaning:
      "The scan crashed during execution. The requestId variable was not " +
      "defined when the result handler tried to use it (original cause, " +
      "fixed 2026-10-09). If seen again, check for unhandled exceptions " +
      "in the scan pipeline.",
    causes: [
      "Unhandled exception in Gemini API call",
      "Variable scoping bug in scanWorkflow.js",
      "Collector throwing uncaught error",
    ],
    fix: "Check Cloud Functions logs for the stack trace. The error is logged with [scan] prefix.",
  },
  20202: {
    title: "Gemini API rejected the request",
    component: "geminiEngine.js / analyzeImageWithGemini",
    meaning:
      "Google's Gemini API returned 400 Bad Request. The prompt or schema " +
      "sent to Gemini contained an invalid argument. This happened " +
      "2026-10-09 when P3/P4 schema sections were added.",
    causes: [
      "Schema too complex for Gemini structured output",
      "Bare object types without properties",
      "Nested arrays exceeding Gemini limits",
    ],
    fix: "Simplify the responseSchema. Remove complex nested objects. Test schema changes incrementally.",
  },
  20203: {
    title: "Quota exhausted",
    component: "entitlementStore.js",
    meaning: "The user has no scans remaining in their quota.",
    causes: ["Free tier weekly limit reached", "Subscription scans depleted"],
    fix: "User needs to wait for reset, purchase top-up, or upgrade.",
  },
};

function decodeError(code) {
  const num = parseInt(code, 10);
  const entry = ERROR_CODES[num];
  if (!entry) {
    return {
      code: num,
      title: "Unknown error code",
      meaning: "This error code is not in the forensic reference.",
      suggestion: "Check Cloud Functions logs for details.",
    };
  }
  return { code: num, ...entry };
}

module.exports = { ERROR_CODES, decodeError };

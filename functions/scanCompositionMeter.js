/**
 * @file functions/scanCompositionMeter.js
 * @class Class 1
 * @cap 150 Lines
 * @responsibility Measure where scan prompt/report payload size lives for T07 cost diagnosis.
 * @dependencies None.
 * @security_gate Stores measurements only; prompt text and report section text are never copied into composition telemetry.
 * @owner_context 411 Scanner T07 Business Center payload observability.
 *
 * Google reports authoritative request-level token buckets, not exact
 * semantic token allocation by 411 section.
 *
 * These measurements are explicitly 411-derived composition estimates.
 * They explain unusually large scans without pretending Google supplied
 * per-section billing numbers.
 */

const ESTIMATED_CHARS_PER_TOKEN = 4;

/** Measure text without retaining the text itself. */
function measureText(value) {
  const text =
    typeof value === "string"
      ? value
      : "";

  return {
    characters: text.length,
    utf8Bytes:
      Buffer.byteLength(text, "utf8"),
    estimatedTextTokens:
      Math.ceil(
        text.length /
        ESTIMATED_CHARS_PER_TOKEN
      ),
  };
}

/** Serialize one structured report section for measurement only. */
function measureSection(value) {
  if (
    value === undefined ||
    value === null
  ) {
    return {
      characters: 0,
      utf8Bytes: 0,
      estimatedTextTokens: 0,
    };
  }

  let serialized = "";

  try {
    serialized =
      JSON.stringify(value);
  } catch (error) {
    serialized = "";
  }

  return measureText(serialized);
}

/**
 * Measure caller-selected input text and major output sections.
 * Only counts survive; source text is never returned.
 */
function measureScanComposition({
  inputTextParts = {},
  report = {},
} = {}) {
  const input = {};

  for (
    const [name, value]
    of Object.entries(inputTextParts)
  ) {
    input[name] =
      measureText(value);
  }

  const output = {
    consumerCard:
      measureSection(
        report.consumer_card
      ),

    solicitationIdentity:
      measureSection(
        report.solicitation_identity
      ),

    solicitationPattern:
      measureSection(
        report.solicitation_pattern
      ),

    technicalLedger:
      measureSection(
        report.technical_ledger
      ),

    alternatives:
      measureSection(
        report.alternatives
      ),

    secondaryTargetsNote:
      measureSection(
        report
          .consumer_card
          ?.secondary_targets_note
      ),

    fullStructuredReport:
      measureSection(report),
  };

  return {
    measurementType:
      "411_derived_text_composition",

    estimator: {
      method:
        "character_count_divided_by_four",

      estimatedCharactersPerToken:
        ESTIMATED_CHARS_PER_TOKEN,

      billingAuthority:
        "provider_usage_metadata",

      caveat:
        "Composition estimates explain payload size but are not provider-reported semantic token billing.",
    },

    input,
    output,
  };
}

module.exports = {
  measureScanComposition,
};

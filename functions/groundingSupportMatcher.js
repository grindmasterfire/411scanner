/**
 * @file functions/groundingSupportMatcher.js
 * @class Class 1
 * @cap 150 Lines
 * @responsibility Match a Technical 411 finding to a
 * provider grounding-support response segment.
 * @dependencies None.
 * @security_gate Text similarity never creates authority
 * or URLs; it only selects among provider support records.
 * @owner_context 411 Scanner Technical 411.
 */

const STOP_WORDS =
  new Set([
    "about",
    "after",
    "also",
    "been",
    "being",
    "from",
    "have",
    "into",
    "that",
    "their",
    "there",
    "these",
    "they",
    "this",
    "were",
    "with",
  ]);

function clean(value) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function normalizedText(value) {
  return clean(value)
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      " "
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}

function significantTokens(value) {
  return new Set(
    normalizedText(value)
      .split(" ")
      .filter(
        (token) =>
          token.length >= 4 &&
          !STOP_WORDS.has(token)
      )
  );
}

function supportMatchesFinding(
  finding,
  supportText
) {
  const findingText =
    normalizedText(finding);

  const support =
    normalizedText(supportText);

  if (
    findingText.length >= 16 &&
    support.length >= 16 &&
    (
      findingText.includes(support) ||
      support.includes(findingText)
    )
  ) {
    return true;
  }

  const findingTokens =
    significantTokens(findingText);

  const supportTokens =
    significantTokens(support);

  if (
    findingTokens.size < 3 ||
    supportTokens.size < 3
  ) {
    return false;
  }

  let overlap = 0;

  for (
    const token
    of findingTokens
  ) {
    if (supportTokens.has(token)) {
      overlap += 1;
    }
  }

  const smallerSetSize =
    Math.min(
      findingTokens.size,
      supportTokens.size
    );

  return (
    overlap >= 3 &&
    overlap / smallerSetSize >= 0.7
  );
}

module.exports = {
  supportMatchesFinding,
};

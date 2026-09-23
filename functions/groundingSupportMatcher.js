/**
 * @file functions/groundingSupportMatcher.js
 * @class Class 1
 * @cap 150 Lines
 * @responsibility Match a Technical 411 finding to provider grounding support.
 * @dependencies None.
 * @security_gate Similarity selects provider support only; it never creates authority or URLs.
 * @owner_context 411 Scanner Technical 411.
 */

const STOP_WORDS = new Set([
  "about", "after", "also", "been", "being", "from", "have", "into",
  "that", "their", "there", "these", "they", "this", "were", "with",
]);

const TOKEN_RULES = [
  [/^(complaint|complaints|report|reports|reported|reporting)$/, "report"],
  [/^(accept|accepts|accepted|accepting)$/, "accept"],
  [/^(block|blocks|blocked|blocking)$/, "block"],
  [/^(cashout|cashouts|withdrawal|withdrawals|withdraw|withdrawing)$/, "withdraw"],
  [/^(deposit|deposits|deposited|depositing)$/, "deposit"],
  [/^(cash|money|fund|funds)$/, "fund"],
  [/^(confirm|confirms|confirmed|confirming)$/, "confirm"],
];

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function canonicalToken(token) {
  for (const [pattern, replacement] of TOKEN_RULES) {
    if (pattern.test(token)) return replacement;
  }
  return token;
}

function normalizedText(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function significantTokens(value) {
  return new Set(
    normalizedText(value)
      .split(" ")
      .map(canonicalToken)
      .filter((token) => token.length >= 4 && !STOP_WORDS.has(token))
  );
}

function isBindableSupport(value) {
  const raw = clean(value);

  return (
    raw.length >= 16 &&
    raw.length <= 600 &&
    !raw.startsWith("{") &&
    !raw.startsWith("[") &&
    raw.split("\n").length <= 6
  );
}

function supportMatchesFinding(finding, supportText) {
  if (!isBindableSupport(supportText)) return false;

  const findingText = normalizedText(finding);
  const support = normalizedText(supportText);

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

  const findingTokens = significantTokens(findingText);
  const supportTokens = significantTokens(support);

  if (
    findingTokens.size < 4 ||
    supportTokens.size < 4
  ) {
    return false;
  }

  let overlap = 0;

  for (const token of findingTokens) {
    if (supportTokens.has(token)) {
      overlap += 1;
    }
  }

  const smallerSetSize = Math.min(
    findingTokens.size,
    supportTokens.size
  );

  return (
    overlap >= 4 &&
    overlap / smallerSetSize >= 0.6
  );
}

module.exports = {
  supportMatchesFinding,
};

/**
 * @file functions/cacheTextSignals.js
 * @class Class 1
 * @cap 150 Lines
 * @responsibility Normalize OCR text and calculate deterministic Cache Bank text-match signals.
 * @dependencies None.
 * @security_gate Text signals are candidate clues only and never establish solicitation identity.
 * @owner_context 411 Scanner cross-creative Cache Bank matching.
 */

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:/-]+/g, " ")
    .replace(/\s+/g, " ");
}

function tokenizeText(value) {
  const normalized =
    normalizeText(value);

  if (!normalized) {
    return [];
  }

  return [...new Set(
    normalized
      .split(" ")
      .filter((token) => token.length >= 3)
  )].sort();
}

function calculateTokenOverlap(
  leftTokens,
  rightTokens
) {
  const left =
    new Set(leftTokens || []);

  const right =
    new Set(rightTokens || []);

  if (!left.size || !right.size) {
    return 0;
  }

  let matches = 0;

  for (const token of left) {
    if (right.has(token)) {
      matches += 1;
    }
  }

  const union =
    new Set([...left, ...right]).size;

  return union
    ? matches / union
    : 0;
}

function countAnchorHits(
  text,
  anchors
) {
  if (!Array.isArray(anchors)) {
    return 0;
  }

  const normalized =
    normalizeText(text);

  return anchors
    .map(normalizeText)
    .filter((anchor) => anchor.length >= 4)
    .filter((anchor) =>
      normalized.includes(anchor)
    )
    .length;
}

function containsAnchor(
  text,
  anchor
) {
  const normalizedAnchor =
    normalizeText(anchor);

  return Boolean(
    normalizedAnchor &&
    normalizeText(text).includes(
      normalizedAnchor
    )
  );
}

module.exports = {
  normalizeText,
  tokenizeText,
  calculateTokenOverlap,
  countAnchorHits,
  containsAnchor,
};

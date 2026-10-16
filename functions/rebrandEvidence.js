/**
 * @file functions/rebrandEvidence.js
 * @class Class 1 (Focused Logic Component)
 * @cap 60 Lines
 * @responsibility Server backstop for the rebrand_pattern floor raiser: the
 *   evidence must describe a CHANGE of name (prior name → new name), not
 *   names used side by side.
 * @dependencies none
 * @security_gate Pure text check on the model's evidence statements.
 * @owner_context Owner ruling 2026-10-16 (UAC 4u): concurrent trade names
 *   scored as a rebrand (+1.0). The tightened prompt alone did not hold on
 *   a live scan ("operates concurrently and historically under shifting
 *   names … following consumer protection alerts").
 */

// Words a real rebrand's evidence uses: the prior name and the change.
const CHANGE_WORDING = /\b(formerly|previously (known|called|named|operated)|renamed|rebrand(ed|ing)? (from|as|to)|changed (its |their )?name|new name|name change|re-?registered as|reincorporated|reorgani[sz]ed as|successor|replaced by|now (calls itself|known as|operates as|called))\b/i;

// Names used at the same time are not a rebrand, however described.
const CONCURRENT_WORDING = /\b(concurrent(ly)?|simultaneous(ly)?|side by side|at the same time|in parallel|alongside|network of (aliases|trade names|brands)|multiple (trade names|dbas|brands))\b/i;

/** True when at least one statement describes a name change and none describes concurrent names. */
function describesNameChange(statements) {
  const list = (Array.isArray(statements) ? statements : []).map((s) => String(s || ""));
  if (list.some((s) => CONCURRENT_WORDING.test(s))) return false;
  return list.some((s) => CHANGE_WORDING.test(s));
}

module.exports = { CHANGE_WORDING, CONCURRENT_WORDING, describesNameChange };

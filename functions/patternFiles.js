/**
 * @file functions/patternFiles.js
 * @class Class 2
 * @cap 200 lines
 * @responsibility The Cache Bank's file on a scam pattern: what each
 *   pattern Deep Dive learned, kept per campaign so the next Deep Dive on
 *   the same scam starts from it and adds what's new.
 * @dependencies firebase-admin/firestore
 * @security_gate Admin SDK only (Firestore rules deny clients). Stores the
 *   Deep Dive text and grounded source links; no user identity beyond
 *   counts.
 * @owner_context 411 Scanner Cache Bank pattern intelligence (fire 10/15).
 *
 * Doc shape at pattern_files/{patternKey}:
 *   { patternKey, solicitationType, campaignName, channel, text,
 *     diveCount, exampleCacheKeys: [..up to 25], firstFiledAt, updatedAt }
 */

const { FieldValue } = require("firebase-admin/firestore");

const COLLECTION = "pattern_files";
const MAX_EXAMPLES = 25;

const UNKNOWN_ACTOR = /^(|unknown|unidentified|n\/a|none|not established|unattributed)\b|unidentified|unknown (actor|sender|operator)|threat actor|compromised/i;

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

/**
 * A report whose actor can't be named: the useful intelligence is the
 * scam pattern, not "the company".
 */
function isPatternTarget(report) {
  const identity = (report && report.solicitation_identity) || {};
  const confidence = String(identity.confidence || "").toLowerCase();
  return (
    confidence === "pattern_only" ||
    confidence === "unknown" ||
    UNKNOWN_ACTOR.test(String(identity.operator || "").trim())
  );
}

/** One file per campaign: pattern type + campaign name. */
function patternKeyFor(report) {
  const identity = (report && report.solicitation_identity) || {};
  const pattern = (report && report.solicitation_pattern) || {};
  const type = slug(pattern.solicitation_type) || "unclassified";
  const campaign = slug(identity.canonical_name);
  return campaign ? `${type}__${campaign}` : type;
}

async function readPatternFile(db, patternKey) {
  try {
    const snap = await db.collection(COLLECTION).doc(patternKey).get();
    return snap.exists ? snap.data() : null;
  } catch (e) {
    console.warn("[patternFiles] read failed:", e.message);
    return null;
  }
}

/** File (or refresh) the pattern with the latest Deep Dive. Never throws. */
async function filePattern(db, { patternKey, report, text, cacheKey }) {
  const identity = (report && report.solicitation_identity) || {};
  const pattern = (report && report.solicitation_pattern) || {};
  try {
    const ref = db.collection(COLLECTION).doc(patternKey);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const prior = snap.exists ? snap.data() : null;
      const examples = Array.isArray(prior?.exampleCacheKeys) ? prior.exampleCacheKeys : [];
      tx.set(ref, {
        patternKey,
        solicitationType: pattern.solicitation_type || prior?.solicitationType || "",
        campaignName: identity.canonical_name || prior?.campaignName || "",
        channel: identity.channel || prior?.channel || "",
        text,
        diveCount: (Number(prior?.diveCount) || 0) + 1,
        exampleCacheKeys: cacheKey && !examples.includes(cacheKey)
          ? [...examples, cacheKey].slice(-MAX_EXAMPLES)
          : examples,
        firstFiledAt: prior?.firstFiledAt || FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
  } catch (e) {
    console.warn("[patternFiles] write failed:", e.message);
  }
}

module.exports = {
  isPatternTarget,
  patternKeyFor,
  readPatternFile,
  filePattern,
};

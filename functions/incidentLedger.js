/**
 * @file functions/incidentLedger.js
 * @class Class 2
 * @cap 250 lines
 * @responsibility The Incident Ledger: a permanent, per-incident record of
 *   everything the model saw and did, so any later interrogation loads the
 *   complete file instead of reconstructing it.
 * @dependencies firebase-admin (Firestore + Cloud Storage), crypto
 * @security_gate Owner-only: private bucket (public access prevented,
 *   viewers removed) and an admin-only Firestore collection (rules deny
 *   clients). Specimens hold user PII: 90-day retention (bucket lifecycle);
 *   traces and the index: 1 year. Append-only: an incident is created once
 *   and never edited; interrogation notes go in a subcollection.
 * @owner_context Spec from Muse, ruled by fire 2026-10-15.
 *
 * Layout:
 *   gs://scanner-4ea67-incidents/specimens/<cacheKey>.<ext>   original bytes
 *     (cacheKey = sha256 of the image, so the same screenshot is stored once
 *     and a Deep Dive's cacheKey points straight at its specimen)
 *   gs://scanner-4ea67-incidents/prompts/<sha256>.txt        system prompts
 *   gs://scanner-4ea67-incidents/traces/<requestId>.json     OCR, every call
 *     (prompt parts, raw response, grounding), final report
 *   incidents/<requestId>  (Firestore index: tag, score, date, account, links)
 *   incidents/<requestId>/notes/<auto>  interrogation notes (append-only)
 */

const crypto = require("crypto");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const { extractFloorRaisers } = require("./actionMeterFloorRaisers");

const BUCKET = "scanner-4ea67-incidents";
const COLLECTION = "incidents";
const INDEX_RETENTION_MS = 365 * 24 * 60 * 60 * 1000;

const EXT = { "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/heic": "heic" };

function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function bucket() {
  return admin.storage().bucket(BUCKET);
}

async function saveOnce(path, data, contentType) {
  const file = bucket().file(path);
  const [exists] = await file.exists();
  if (!exists) await file.save(data, { contentType, resumable: false });
  return `gs://${BUCKET}/${path}`;
}

/*
 * Type tag, written at scan time for cross-incident questions.
 * attack: the specimen tries to instruct an AI scanner.
 * scam: score 8.0+. legit: score below 4.0. Everything else, failures
 * included: inconclusive.
 */
function tagIncident(report, failed) {
  if (failed || !report) return "inconclusive";
  const pattern = report.solicitation_pattern || {};
  const card = report.consumer_card || {};
  const flags = report.technical_ledger?.technical_flags || [];
  const text = [pattern.solicitation_type, ...(card.classification_badges || []), ...flags]
    .join(" ").toLowerCase();
  // AI-attack signals only. Bare "jailbreak"/"adversarial" also describe
  // ordinary findings (myD&B: "storefront_jailbreak_detection_bugs", i.e.
  // jailbroken phones), which were mis-tagged as attacks.
  if (/prompt[\s_-]*injection|llm01|instruction[\s_-]*override|ai[\s_-]*jailbreak/.test(text)) return "attack";
  const score = Number(card.action_meter_score);
  if (score >= 8) return "scam";
  if (score < 4) return "legit";
  return "inconclusive";
}

/**
 * Floor raisers the server accepted (true AND evidenced), each with its
 * evidence, for `business-center.js raisers`. { rebrand_pattern: "..." }
 */
function validatedFloorRaisers(report) {
  const card = (report && report.consumer_card) || {};
  const accepted = extractFloorRaisers(report || {});
  const evidence = card.floor_raiser_evidence || {};
  const out = {};
  for (const [camel, ok] of Object.entries(accepted)) {
    if (!ok) continue;
    const name = camel.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
    out[name] = (evidence[name] || []).join(" ").slice(0, 600);
  }
  return out;
}

/**
 * Write one incident. Best-effort: never throws, so a storage problem can't
 * fail or delay a scan the user already paid for.
 */
async function writeIncident(db, {
  kind = "scan",
  requestId,
  uid = null,
  cacheKey = null,
  imageBase64 = null,
  mimeType = "image/jpeg",
  ocrText = "",
  report = null,
  trace = [],
  facts = {},
  failure = null,
}) {
  if (!requestId) return null;
  try {
    let specimen = null;
    if (imageBase64 && cacheKey) {
      const raw = String(imageBase64).replace(/^data:[^;]+;base64,/, "");
      const bytes = Buffer.from(raw, "base64");
      const path = `specimens/${cacheKey}.${EXT[mimeType] || "jpg"}`;
      specimen = {
        uri: await saveOnce(path, bytes, mimeType || "image/jpeg"),
        mimeType: mimeType || "image/jpeg",
        bytes: bytes.length,
        sha256: sha256(bytes),
      };
    }

    // System prompts are big and repeat: store each version once.
    const calls = [];
    for (const call of trace || []) {
      const { systemPrompt, ...rest } = call;
      let systemPromptRef = null;
      if (systemPrompt) {
        const hash = sha256(systemPrompt);
        systemPromptRef = await saveOnce(`prompts/${hash}.txt`, systemPrompt, "text/plain; charset=utf-8");
      }
      calls.push({ ...rest, systemPromptRef });
    }

    const traceDoc = { kind, requestId, cacheKey, ocrText, calls, report, failure, facts };
    const traceJson = JSON.stringify(traceDoc);
    const traceUri = await saveOnce(`traces/${requestId}.json`, traceJson, "application/json");

    const card = (report && report.consumer_card) || {};
    const identity = (report && report.solicitation_identity) || {};
    const now = Date.now();
    await db.collection(COLLECTION).doc(requestId).create({
      kind,
      requestId,
      uid,
      cacheKey,
      createdAt: FieldValue.serverTimestamp(),
      createdAtMs: now,
      expireAt: new Date(now + INDEX_RETENTION_MS),
      tag: kind === "scan" ? tagIncident(report, Boolean(failure)) : kind,
      score: Number.isFinite(Number(card.action_meter_score)) ? Number(card.action_meter_score) : null,
      verdict: card.verdict_label || null,
      target: card.target_name || null,
      channel: identity.channel || null,
      solicitationType: report?.solicitation_pattern?.solicitation_type || null,
      failureCode5: failure?.code5 || null,
      floorRaisers: kind === "scan" ? validatedFloorRaisers(report) : {},
      modelCalls: calls.length,
      searchQueries: calls.reduce((n, c) => n + (c.grounding?.queries?.length || 0), 0),
      specimen,
      traceUri,
      traceBytes: traceJson.length,
      ...facts,
    });
    return requestId;
  } catch (e) {
    // ALREADY_EXISTS (a replayed request) is fine: the first write wins.
    if (!/already exists|ALREADY_EXISTS/i.test(String(e.message))) {
      console.warn(`[incident] write failed for ${requestId}: ${e.message}`);
    }
    return null;
  }
}

module.exports = {
  validatedFloorRaisers,
  writeIncident,
  tagIncident,
  INCIDENT_BUCKET: BUCKET,
};

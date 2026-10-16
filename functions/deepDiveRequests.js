/**
 * @file functions/deepDiveRequests.js
 * @class Class 2
 * @cap 120 Lines
 * @responsibility Background Deep Dives: claim each client request ID
 *   before anything is charged, record the outcome, and answer a repeat of
 *   the same ID with that outcome (done / still running / failed), never
 *   a second dive or a second charge.
 * @dependencies firebase-functions/v2/https (HttpsError)
 * @security_gate Keyed by account + request ID: one account can't read or
 *   replay another's dive. Admin SDK only (rules deny clients).
 * @owner_context fire 2026-10-16: "Deep Dive runs server-side and async.
 *   User taps, goes about their day, report arrives by notification."
 *   Same safe-resend contract as scans (Story 6.10).
 *
 * Doc: deepdive_requests/{uid}__{requestId}
 *   { uid, requestId, status: running|done|failed, text?, code5?, message?,
 *     createdAtMs, finishedAtMs?, expireAt }   (24h, Firestore TTL)
 */

const { HttpsError } = require("firebase-functions/v2/https");

const COLLECTION = "deepdive_requests";
const RETENTION_MS = 24 * 60 * 60 * 1000;
// A dive takes 1-3 minutes. Still "running" after this, the instance died
// mid-dive: report it as failed (the credit was spent; every attempt counts).
const STALE_MS = 10 * 60 * 1000;
const REQUEST_ID = /^[A-Za-z0-9_-]{8,80}$/;

const validRequestId = (id) => typeof id === "string" && REQUEST_ID.test(id);
const docRef = (db, uid, requestId) => db.collection(COLLECTION).doc(`${uid}__${requestId}`);

/**
 * Claim the request. Returns { claimed: true } for a new request, or
 * { existing } with the stored record for a repeat.
 */
async function claimDiveRequest(db, uid, requestId, nowMs = Date.now()) {
  const ref = docRef(db, uid, requestId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return { existing: snap.data() };
    tx.create(ref, {
      uid,
      requestId,
      status: "running",
      createdAtMs: nowMs,
      expireAt: new Date(nowMs + RETENTION_MS),
    });
    return { claimed: true };
  });
}

async function finishDiveRequest(db, uid, requestId, outcome, nowMs = Date.now()) {
  try {
    await docRef(db, uid, requestId).set({ ...outcome, finishedAtMs: nowMs }, { merge: true });
  } catch (e) {
    console.warn(`[deepDive] request ${requestId} outcome not recorded: ${e.message}`);
  }
}

/** The answer to a repeated request ID. Throws for a failed dive. */
function replyForExisting(record, nowMs = Date.now()) {
  if (record.status === "done") {
    return { deepDive: record.text || "", requestId: record.requestId, state: "done" };
  }
  if (record.status === "running" && nowMs - (record.createdAtMs || 0) < STALE_MS) {
    return { requestId: record.requestId, state: "pending" };
  }
  const code5 = record.status === "failed" ? record.code5 || "70101" : "70101";
  const message = record.status === "failed" && record.message
    ? record.message
    : "The Deep Dive couldn't finish.";
  throw new HttpsError(code5 === "40201" ? "resource-exhausted" : "internal", message, { code5 });
}

/** The stored outcome for an error thrown by the dive. */
function failureOutcome(error) {
  return {
    status: "failed",
    code5: (error && error.details && error.details.code5) || "70101",
    message: (error && error instanceof HttpsError && error.message) || "The Deep Dive couldn't finish.",
  };
}

module.exports = {
  COLLECTION,
  STALE_MS,
  validRequestId,
  claimDiveRequest,
  finishDiveRequest,
  replyForExisting,
  failureOutcome,
};

/**
 * @file functions/adGate.js
 * @responsibility Server-side rewarded-ad gate for scans: AdMob Server-Side
 *   Verification (SSV) callbacks, single-use ad tickets, and the free-tier
 *   weekly counter.
 * @security_gate The app never proves an ad was watched. Google does: on
 *   reward, AdMob calls admobSsv with an ECDSA-signed query. Only a verified
 *   callback creates a ticket, a ticket is bound to one uid, and it can be
 *   claimed once. The free-tier counter lives here, not on the device, so
 *   clearing app data grants nothing.
 * @owner_context Ad revenue offsets API cost. Everyone watches an ad before
 *   every scan except the tester account and the Professional tier.
 *
 * Collections (server-only; client access denied by the default rule):
 *   ad_tickets/{adTicket}        uid, transactionId, adUnit, rewardAmount,
 *                                verifiedAtMs, expiresAtMs, consumedAtMs,
 *                                consumedByRequestId
 *   ad_transactions/{txId}       adTicket, receivedAtMs (duplicate guard)
 *   free_usage/{uid}             windowStartMs, scansUsed, lastScanAtMs,
 *                                lastAdTicket
 *   ad_nofill/{uid}              claims, lastClaimAtMs (subscriber no-fill log)
 */

const crypto = require("crypto");
const { HttpsError } = require("firebase-functions/v2/https");
const { FieldValue } = require("firebase-admin/firestore");
const { messageFor } = require("./scanErrorCodes");

const VERIFIER_KEYS_URL =
  "https://www.gstatic.com/admob/reward/verifier-keys.json";
const KEY_CACHE_MS = 24 * 60 * 60 * 1000;

// Production rewarded interstitial (AdManager.kt PROD_REWARDED_INTERSTITIAL_ID).
const PROD_AD_UNIT = "ca-app-pub-1323472894046973/8930397909";

const FREE_SCANS_PER_WINDOW = 1;
const FREE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const TICKET_TTL_MS = 15 * 60 * 1000;
// SSV callbacks can land a few seconds after the app's scan request.
let TICKET_WAIT_MS = 8000;
let TICKET_POLL_MS = 1000;

const TICKET_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/* ------------------------------------------------------------------ */
/* SSV signature verification                                          */
/* ------------------------------------------------------------------ */

let keyCache = { keys: new Map(), fetchedAtMs: 0 };

async function fetchVerifierKeys() {
  const res = await fetch(VERIFIER_KEYS_URL);
  if (!res.ok) throw new Error(`verifier keys HTTP ${res.status}`);
  const body = await res.json();
  const keys = new Map();
  for (const k of body.keys || []) {
    if (k && k.keyId !== undefined && k.pem) keys.set(String(k.keyId), k.pem);
  }
  keyCache = { keys, fetchedAtMs: Date.now() };
}

async function getVerifierKey(keyId) {
  const stale = Date.now() - keyCache.fetchedAtMs > KEY_CACHE_MS;
  // Unknown key id means Google rotated keys: refetch once.
  if (stale || !keyCache.keys.has(String(keyId))) await fetchVerifierKeys();
  return keyCache.keys.get(String(keyId)) || null;
}

/**
 * Verify an SSV callback's raw query string (everything after "?", still
 * URL-encoded). Google signs the bytes before "&signature=", so the query
 * must not be decoded or re-serialized before checking.
 */
async function verifySsvQuery(rawQuery) {
  const sigAt = rawQuery.indexOf("&signature=");
  if (sigAt < 0) return { valid: false, reason: "no_signature" };
  const message = rawQuery.slice(0, sigAt);
  const params = new URLSearchParams(rawQuery);
  const signature = params.get("signature");
  const keyId = params.get("key_id");
  if (!signature || !keyId) return { valid: false, reason: "no_signature" };

  const pem = await getVerifierKey(keyId);
  if (!pem) return { valid: false, reason: "unknown_key" };

  let valid = false;
  try {
    valid = crypto.verify(
      "sha256",
      Buffer.from(message, "utf8"),
      pem,
      Buffer.from(signature, "base64url")
    );
  } catch (e) {
    return { valid: false, reason: "bad_signature" };
  }
  return valid
    ? { valid: true, params }
    : { valid: false, reason: "bad_signature" };
}

function isProdAdUnit(adUnit) {
  const value = String(adUnit || "");
  // SSV sends the numeric ad unit id; accept the full id too.
  return value === PROD_AD_UNIT || value === PROD_AD_UNIT.split("/")[1];
}

/**
 * Handle one AdMob SSV callback. Returns { status, body } for the HTTP
 * layer. A verified callback always gets 200 so Google stops retrying,
 * even when it carries nothing we can use (e.g. the console's test URL).
 */
async function handleSsvCallback(db, rawQuery) {
  const check = await verifySsvQuery(rawQuery || "");
  if (!check.valid) {
    console.warn(`[adGate] SSV rejected: ${check.reason}`);
    return { status: 403, body: "invalid signature" };
  }
  const p = check.params;
  const transactionId = p.get("transaction_id") || "";
  const adTicket = (p.get("custom_data") || "").toLowerCase();
  const uid = p.get("user_id") || "";
  const adUnit = p.get("ad_unit") || "";

  if (!isProdAdUnit(adUnit)) {
    console.warn(`[adGate] SSV for unexpected ad unit ${adUnit}; ignored.`);
    return { status: 200, body: "ignored" };
  }
  if (!transactionId || !uid || !TICKET_RE.test(adTicket)) {
    console.warn("[adGate] SSV missing transaction/user/ticket; ignored.");
    return { status: 200, body: "ignored" };
  }

  const now = Date.now();
  const txRef = db.collection("ad_transactions").doc(transactionId);
  const ticketRef = db.collection("ad_tickets").doc(adTicket);
  const outcome = await db.runTransaction(async (tx) => {
    const txSnap = await tx.get(txRef);
    if (txSnap.exists) return "duplicate";
    const ticketSnap = await tx.get(ticketRef);
    tx.set(txRef, { adTicket, receivedAtMs: now });
    // A ticket id already verified by another reward is never rebound.
    if (ticketSnap.exists) return "ticket_reused";
    tx.set(ticketRef, {
      uid,
      transactionId,
      adUnit,
      rewardAmount: Number(p.get("reward_amount")) || 0,
      verifiedAtMs: now,
      expiresAtMs: now + TICKET_TTL_MS,
      consumedAtMs: null,
      consumedByRequestId: null,
    });
    return "verified";
  });
  console.log(`[adGate] SSV ${outcome} ticket=${adTicket} uid=${uid}`);
  return { status: 200, body: outcome };
}

/* ------------------------------------------------------------------ */
/* Scan-time gate                                                      */
/* ------------------------------------------------------------------ */

function gateError(code, code5) {
  return new HttpsError(code, messageFor(code5), { code5 });
}

/** Rolling 7-day window starting at the first free scan in it. */
function freeWindowState(usage, now) {
  const start = Number(usage && usage.windowStartMs) || 0;
  if (!start || now >= start + FREE_WINDOW_MS) {
    return { windowStartMs: now, scansUsed: 0, fresh: true };
  }
  return {
    windowStartMs: start,
    scansUsed: Number(usage.scansUsed) || 0,
    fresh: false,
  };
}

/** Free-scan status for the quota badge. */
/*
 * The weekly free scan belongs to the device as well as the account.
 * Clearing app data signs the phone in as a brand-new anonymous user, so
 * per-account counting alone handed out a free scan per reset (5 free
 * scans, 5 anonymous accounts, 10/14-15). The app sends a hash of the
 * Android ID (stable across data clears and reinstalls); the server hashes
 * it again so the stored key never matches anything on the phone.
 */
const DEVICE_KEY_RE = /^[a-f0-9]{64}$/;

function deviceDocId(deviceKey) {
  const key = String(deviceKey || "").toLowerCase();
  if (!DEVICE_KEY_RE.test(key)) return null;
  return crypto.createHash("sha256").update(`411-free-device:${key}`).digest("hex");
}

/** The stricter of the account's and the device's free window. */
function stricterWindow(a, b) {
  if (!b) return a;
  if (b.scansUsed > a.scansUsed) return b;
  if (a.scansUsed > b.scansUsed) return a;
  return a.windowStartMs >= b.windowStartMs ? a : b;
}

async function getFreeUsage(db, uid, deviceKey = null) {
  const snap = await db.collection("free_usage").doc(uid).get();
  const now = Date.now();
  const deviceId = deviceDocId(deviceKey);
  const deviceSnap = deviceId
    ? await db.collection("free_usage_devices").doc(deviceId).get()
    : null;
  const state = stricterWindow(
    freeWindowState(snap.exists ? snap.data() : null, now),
    deviceSnap ? freeWindowState(deviceSnap.exists ? deviceSnap.data() : null, now) : null
  );
  return {
    freeScansAllowed: FREE_SCANS_PER_WINDOW,
    freeScansUsed: state.scansUsed,
    freeWindowResetsAtMs: state.fresh
      ? null
      : state.windowStartMs + FREE_WINDOW_MS,
  };
}

async function waitForTicket(db, adTicket) {
  const ref = db.collection("ad_tickets").doc(adTicket);
  const deadline = Date.now() + TICKET_WAIT_MS;
  for (;;) {
    const snap = await ref.get();
    if (snap.exists) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((r) => setTimeout(r, TICKET_POLL_MS));
  }
}

/**
 * Enforce the ad gate before any cache lookup or Gemini call.
 * Returns { mode, adTicket } — pass the result to releaseAdGate if the scan
 * is refused later in the gate (e.g. quota) so the viewer's ad isn't lost.
 *
 * Free tier: verified ticket + 1 scan per rolling 7 days, claimed together.
 * Subscribers: verified ticket, except a reported no-fill (logged per uid).
 * Tester and Professional: no ad.
 */
async function enforceAdGate(
  db,
  { uid, isTester = false, tier = "free", adTicket, adNoFill = false, deviceKey = null }
) {
  if (isTester) return { mode: "tester" };
  // Entitlement tier ids come from entitlementStore: Professional is "pro".
  if (tier === "pro") return { mode: "professional" };
  if (!uid) throw gateError("unauthenticated", "80101");

  const isFree = !tier || tier === "free";
  const now = Date.now();

  const deviceId = isFree ? deviceDocId(deviceKey) : null;

  if (isFree) {
    const usage = await getFreeUsage(db, uid, deviceKey);
    if (usage.freeScansUsed >= FREE_SCANS_PER_WINDOW) {
      throw gateError("resource-exhausted", "60101");
    }
  } else if (adNoFill) {
    await db.collection("ad_nofill").doc(uid).set(
      { claims: FieldValue.increment(1), lastClaimAtMs: now },
      { merge: true }
    );
    console.warn(`[adGate] subscriber no-fill claim uid=${uid}`);
    return { mode: "subscriber_no_fill" };
  }

  const ticket = String(adTicket || "").toLowerCase();
  if (!TICKET_RE.test(ticket) || !(await waitForTicket(db, ticket))) {
    throw gateError("failed-precondition", "60102");
  }

  const ticketRef = db.collection("ad_tickets").doc(ticket);
  const usageRef = db.collection("free_usage").doc(uid);
  const deviceRef = deviceId ? db.collection("free_usage_devices").doc(deviceId) : null;
  await db.runTransaction(async (tx) => {
    const tSnap = await tx.get(ticketRef);
    const uSnap = isFree ? await tx.get(usageRef) : null;
    const dSnap = isFree && deviceRef ? await tx.get(deviceRef) : null;
    const t = tSnap.exists ? tSnap.data() : null;
    const claimAt = Date.now();
    if (
      !t ||
      t.uid !== uid ||
      t.consumedAtMs ||
      claimAt > Number(t.expiresAtMs || 0)
    ) {
      throw gateError("failed-precondition", "60102");
    }
    if (isFree) {
      const accountState = freeWindowState(
        uSnap.exists ? uSnap.data() : null,
        claimAt
      );
      const deviceState = dSnap
        ? freeWindowState(dSnap.exists ? dSnap.data() : null, claimAt)
        : null;
      const state = stricterWindow(accountState, deviceState);
      if (state.scansUsed >= FREE_SCANS_PER_WINDOW) {
        throw gateError("resource-exhausted", "60101");
      }
      const claim = {
        windowStartMs: state.windowStartMs,
        scansUsed: state.scansUsed + 1,
        lastScanAtMs: claimAt,
        lastAdTicket: ticket,
      };
      tx.set(usageRef, claim);
      if (deviceRef) tx.set(deviceRef, { ...claim, lastUid: uid });
    }
    tx.update(ticketRef, { consumedAtMs: claimAt });
  });

  return {
    mode: isFree ? "free_verified" : "subscriber_verified",
    adTicket: ticket,
  };
}

/** Return a claimed ticket when the scan is refused right after the gate. */
async function releaseAdGate(db, gate) {
  if (!gate || !gate.adTicket || gate.mode !== "subscriber_verified") return;
  try {
    await db
      .collection("ad_tickets")
      .doc(gate.adTicket)
      .update({ consumedAtMs: null });
  } catch (e) {
    console.warn(`[adGate] ticket release failed: ${e.message}`);
  }
}

module.exports = {
  handleSsvCallback,
  enforceAdGate,
  releaseAdGate,
  getFreeUsage,
  PROD_AD_UNIT,
  FREE_SCANS_PER_WINDOW,
  // test hooks
  _verifySsvQuery: verifySsvQuery,
  _setVerifierKeys: (map) => {
    keyCache = { keys: new Map(Object.entries(map)), fetchedAtMs: Date.now() };
  },
  _freeWindowState: freeWindowState,
  _setTicketWait: (waitMs, pollMs) => {
    TICKET_WAIT_MS = waitMs;
    TICKET_POLL_MS = pollMs;
  },
};

/**
 * @file functions/revenueEvents.js
 * @class Class 3 (Business Reporting Component)
 * @cap 200 Lines
 * @responsibility Append-only revenue event ledger for the 411 Business Center.
 * @dependencies firebase-admin (Firestore) via injected db handle.
 * @security_gate Accounting writes only. Never affects entitlements, scans,
 * or purchase verification. A failed event write must never fail a grant.
 * @owner_context 411 Scanner revenue ledger (spec 2026-10-07).
 *
 * Every grant attempt — granted or rejected — is recorded as an immutable
 * event. Prices come from the SERVER price table below; the client only
 * reports a productId. Rejected attempts are the fraud/abuse signal while
 * Play purchase verification is still trust-client.
 */

const REVENUE_EVENTS_COLLECTION =
  "revenue_events";

/**
 * Server-side price and grant table. The single source of truth for what a
 * productId is worth. Change prices here AND in Play Console together.
 *
 * tier/period/kind/scans mirror PRODUCT_MAP and TOPUP_MAP in index.js.
 */
const REVENUE_PRICE_TABLE = {
  // Subscriptions
  standard_weekly: {
    kind: "subscription",
    tier: "rental",
    period: "weekly",
    scans: 7,
    priceUsd: 3.99,
  },
  rental_weekly: {
    kind: "subscription",
    tier: "rental",
    period: "weekly",
    scans: 7,
    priceUsd: 3.99,
  },
  standard_monthly: {
    kind: "subscription",
    tier: "standard",
    period: "monthly",
    scans: 30,
    priceUsd: 12.99,
  },
  standard_annual: {
    kind: "subscription",
    tier: "standard",
    period: "annual",
    scans: 360,
    priceUsd: 129.99,
  },
  pro_monthly: {
    kind: "subscription",
    tier: "pro",
    period: "monthly",
    scans: 60,
    priceUsd: 24.99,
  },
  pro_annual: {
    kind: "subscription",
    tier: "pro",
    period: "annual",
    scans: 720,
    priceUsd: 249.99,
  },
  family_monthly: {
    kind: "subscription",
    tier: "family",
    period: "monthly",
    scans: 40,
    priceUsd: 19.99,
  },
  family_annual: {
    kind: "subscription",
    tier: "family",
    period: "annual",
    scans: 480,
    priceUsd: 199.99,
  },
  // Top-ups (subscriber-only consumables; never expire)
  topup_5: {
    kind: "topup",
    tier: null,
    period: null,
    scans: 5,
    priceUsd: 2.99,
  },
  topup_10: {
    kind: "topup",
    tier: null,
    period: null,
    scans: 10,
    priceUsd: 4.99,
  },
  topup_20: {
    kind: "topup",
    tier: null,
    period: null,
    scans: 20,
    priceUsd: 8.99,
  },
  topup_family_25: {
    kind: "topup",
    tier: "family",
    period: null,
    scans: 25,
    priceUsd: 10.99,
  },
};

function priceFor(productId) {
  return (
    REVENUE_PRICE_TABLE[productId] ||
    null
  );
}

/**
 * Build a revenue event object. Callers supply the attempt facts; pricing
 * is resolved here from the server table.
 */
function buildRevenueEvent({
  uid,
  productId,
  verificationMode,
  verificationVerified,
  playOrderId = null,
  outcome,
  rejectionReason = null,
  familyGroupId = null,
}) {
  const price = priceFor(productId);

  return {
    createdAt: new Date(),
    uid: uid || null,
    kind: price ? price.kind : null,
    productId: productId || null,
    tier: price ? price.tier : null,
    period: price ? price.period : null,
    scansGranted:
      outcome === "granted" && price
        ? price.scans
        : 0,
    // Rejected attempts earn nothing; price is recorded for context.
    priceUsd:
      outcome === "granted" && price
        ? price.priceUsd
        : 0,
    attemptedPriceUsd: price
      ? price.priceUsd
      : 0,
    currency: "USD",
    verification: {
      mode: verificationMode || "unknown",
      verified: !!verificationVerified,
      playOrderId: playOrderId,
    },
    outcome: outcome,
    rejectionReason: rejectionReason,
    familyGroupId: familyGroupId,
  };
}

/**
 * Append one revenue event. Never throws: accounting must never block or
 * break a grant. Failures are logged server-side for operator attention.
 */
async function logRevenueEvent(
  db,
  event
) {
  try {
    await db
      .collection(
        REVENUE_EVENTS_COLLECTION
      )
      .add(event);
  } catch (error) {
    console.error(
      "[revenue-ledger] event write failed (grant unaffected):",
      error && error.message
        ? error.message
        : error
    );
  }
}

module.exports = {
  REVENUE_EVENTS_COLLECTION,
  REVENUE_PRICE_TABLE,
  priceFor,
  buildRevenueEvent,
  logRevenueEvent,
};

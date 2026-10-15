/**
 * Real Google Play purchase verification for the grantEntitlement flow.
 *
 * Replaces the trust-client stub once the Play Console service account
 * exists. Fail-closed: any verification failure (bad token, wrong product,
 * inactive subscription, already-consumed top-up, API error, missing
 * credential) throws and the grant is rejected — the purchase is never
 * granted on doubt.
 *
 * Auth: service account JSON with the
 * `https://www.googleapis.com/auth/androidpublisher` scope, granted access
 * to the app in Play Console (Setup → API access). Provide it via either:
 *   PLAY_SERVICE_ACCOUNT_PATH  absolute path to the JSON key file, or
 *   PLAY_SERVICE_ACCOUNT_JSON  the JSON key inline in an env var.
 *
 * The googleapis dependency is loaded lazily so trust-client mode
 * (PLAY_VERIFY_ENABLED !== "true") never requires it.
 */

const PACKAGE_NAME = "com.fouroneone.scanner";
const ANDROID_PUBLISHER_SCOPE =
  "https://www.googleapis.com/auth/androidpublisher";

function httpsError(code, message) {
  // Avoid a hard require on firebase-functions here so this module stays
  // unit-testable in isolation; index.js converts these to HttpsError.
  const err = new Error(message);
  err.code = code;
  return err;
}

function loadCredentials() {
  const inline = process.env.PLAY_SERVICE_ACCOUNT_JSON;
  if (inline) {
    try {
      return JSON.parse(inline);
    } catch (e) {
      throw httpsError(
        "failed-precondition",
        "PLAY_SERVICE_ACCOUNT_JSON is not valid JSON."
      );
    }
  }
  const path = process.env.PLAY_SERVICE_ACCOUNT_PATH;
  if (path) {
    try {
      // eslint-disable-next-line global-require, import/no-dynamic-require
      return require(path);
    } catch (e) {
      throw httpsError(
        "failed-precondition",
        `Cannot read service account key at PLAY_SERVICE_ACCOUNT_PATH: ${e.message}`
      );
    }
  }
  // No key configured: use the function's own runtime identity (Application
  // Default Credentials). Nothing to leak. Play Console must grant that
  // service account access (Users and permissions).
  return null;
}

/**
 * Build an androidpublisher v3 client. Separated for test injection:
 * pass { client } to skip real auth.
 */
async function buildClient(injected) {
  if (injected && injected.client) return injected.client;
  let google;
  try {
    // eslint-disable-next-line global-require
    ({ google } = require("googleapis"));
  } catch (e) {
    throw httpsError(
      "failed-precondition",
      'The "googleapis" npm package is required for Play verification. ' +
        "Run: npm install googleapis"
    );
  }
  const credentials = loadCredentials();
  const auth = new google.auth.GoogleAuth({
    ...(credentials ? { credentials } : {}),
    scopes: [ANDROID_PUBLISHER_SCOPE],
  });
  return google.androidpublisher({ version: "v3", auth });
}

/**
 * Verify a subscription purchase token. The subscription must be ACTIVE
 * for the exact productId being granted.
 */
async function verifySubscription(client, purchaseToken, productId) {
  let res;
  try {
    res = await client.purchases.subscriptionsv2.get({
      packageName: PACKAGE_NAME,
      token: purchaseToken,
    });
  } catch (e) {
    throw httpsError(
      "unauthenticated",
      `Play subscription lookup failed: ${e.message || e}`
    );
  }
  const sub = res.data || {};
  if (sub.subscriptionState !== "SUBSCRIPTION_STATE_ACTIVE") {
    throw httpsError(
      "permission-denied",
      `Subscription is not active (state: ${sub.subscriptionState || "unknown"}).`
    );
  }
  // subscriptionsv2 returns lineItems; confirm the token is for productId.
  const items = sub.lineItems || [];
  const matches = items.some(
    (li) => li.productId === productId
  );
  if (items.length > 0 && !matches) {
    throw httpsError(
      "permission-denied",
      `Purchase token is not for product ${productId}.`
    );
  }
  return {
    verified: true,
    mode: "play-verified",
    playOrderId: sub.latestOrderId || null,
    obfuscatedAccountId:
      sub.externalAccountIdentifiers?.obfuscatedExternalAccountId || null,
    acknowledged: sub.acknowledgementState === "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED",
  };
}

/**
 * Verify a consumable (top-up) purchase token. Must be purchased and NOT
 * yet consumed — an already-consumed token is a replay and is rejected.
 */
async function verifyConsumable(client, purchaseToken, productId) {
  let res;
  try {
    res = await client.purchases.products.get({
      packageName: PACKAGE_NAME,
      productId,
      token: purchaseToken,
    });
  } catch (e) {
    throw httpsError(
      "unauthenticated",
      `Play product lookup failed: ${e.message || e}`
    );
  }
  const prod = res.data || {};
  if (prod.purchaseState !== 0) {
    throw httpsError(
      "permission-denied",
      `Product purchase is not completed (purchaseState: ${prod.purchaseState}).`
    );
  }
  if (prod.consumptionState !== 0) {
    throw httpsError(
      "permission-denied",
      "Product token was already consumed — possible replay."
    );
  }
  return {
    verified: true,
    mode: "play-verified",
    playOrderId: prod.orderId || null,
    obfuscatedAccountId: prod.obfuscatedExternalAccountId || null,
  };
}

/*
 * After crediting a top-up, consume it on Google's side: a consumed token
 * can't be replayed, and the user can buy the same pack again. Best-effort;
 * the order ledger already blocks a second credit.
 */
async function consumeTopUp(purchaseToken, productId, opts) {
  try {
    const client = await buildClient(opts);
    await client.purchases.products.consume({
      packageName: PACKAGE_NAME,
      productId,
      token: purchaseToken,
    });
    return true;
  } catch (e) {
    console.warn(`[play-verify] consume failed for ${productId}: ${e.message || e}`);
    return false;
  }
}

/* Acknowledge a subscription server-side (Google refunds un-acknowledged
 * purchases after 3 days); the app acknowledges too. Best-effort. */
async function acknowledgeSubscription(purchaseToken, productId, opts) {
  try {
    const client = await buildClient(opts);
    await client.purchases.subscriptions.acknowledge({
      packageName: PACKAGE_NAME,
      subscriptionId: productId,
      token: purchaseToken,
      requestBody: {},
    });
    return true;
  } catch (e) {
    console.warn(`[play-verify] acknowledge failed for ${productId}: ${e.message || e}`);
    return false;
  }
}

/**
 * Main entry. kind is "subscription" or "topup" (from PRODUCT_MAP/TOPUP_MAP).
 * Throws fail-closed on any doubt. Test hook: opts.client injects a mock.
 */
async function verifyPlayPurchase(purchaseToken, productId, kind, opts) {
  if (!purchaseToken) {
    throw httpsError(
      "invalid-argument",
      "Missing purchase token."
    );
  }
  if (!productId) {
    throw httpsError("invalid-argument", "Missing product ID.");
  }
  const client = await buildClient(opts);
  if (kind === "topup") {
    return verifyConsumable(client, purchaseToken, productId);
  }
  return verifySubscription(client, purchaseToken, productId);
}

module.exports = {
  PACKAGE_NAME,
  verifyPlayPurchase,
  consumeTopUp,
  acknowledgeSubscription,
  // exported for unit tests
  _verifySubscription: verifySubscription,
  _verifyConsumable: verifyConsumable,
};

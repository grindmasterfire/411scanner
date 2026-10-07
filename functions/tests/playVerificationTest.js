/**
 * Unit tests for playVerification.js — the real Google Play purchase
 * verification used by grantEntitlement when PLAY_VERIFY_ENABLED=true.
 *
 * The Play Developer API client is mocked; no network, no credentials.
 * Run: node tests/playVerificationTest.js
 */
const assert = require("node:assert/strict");

const {
  verifyPlayPurchase,
  PACKAGE_NAME,
} = require("../playVerification");

function mockClient({ subResponse, prodResponse, subError, prodError }) {
  return {
    purchases: {
      subscriptionsv2: {
        get: async (args) => {
          assert.equal(args.packageName, PACKAGE_NAME);
          assert.ok(args.token, "token passed through");
          if (subError) throw subError;
          return { data: subResponse };
        },
      },
      products: {
        get: async (args) => {
          assert.equal(args.packageName, PACKAGE_NAME);
          assert.equal(args.productId, "topup_10");
          assert.ok(args.token, "token passed through");
          if (prodError) throw prodError;
          return { data: prodResponse };
        },
      },
    },
  };
}

let passed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok: ${name}`);
  } catch (e) {
    console.error(`  FAIL: ${name}\n    ${e.message}`);
    process.exitCode = 1;
  }
}

async function expectThrow(name, fn, codeFragment) {
  await check(name, async () => {
    let thrown = null;
    try {
      await fn();
    } catch (e) {
      thrown = e;
    }
    assert.ok(thrown, "expected a throw, got success");
    if (codeFragment) {
      assert.ok(
        (thrown.code || "") === codeFragment ||
          (thrown.message || "").toLowerCase().includes(codeFragment),
        `expected code/message ${codeFragment}, got ${thrown.code}: ${thrown.message}`
      );
    }
  });
}

(async () => {
console.log("== playVerification ==");

await check("active subscription verifies", async () => {
  const client = mockClient({
    subResponse: {
      subscriptionState: "SUBSCRIPTION_STATE_ACTIVE",
      latestOrderId: "GPA.1234",
      lineItems: [{ productId: "pro_monthly" }],
    },
  });
  const r = await verifyPlayPurchase("tok", "pro_monthly", "subscription",
    { client });
  assert.equal(r.verified, true);
  assert.equal(r.mode, "play-verified");
  assert.equal(r.playOrderId, "GPA.1234");
});

await expectThrow(
  "expired subscription rejected",
  () => verifyPlayPurchase("tok", "pro_monthly", "subscription", {
    client: mockClient({
      subResponse: { subscriptionState: "SUBSCRIPTION_STATE_EXPIRED" },
    }),
  }),
  "permission-denied"
);

await expectThrow(
  "token for wrong product rejected",
  () => verifyPlayPurchase("tok", "pro_monthly", "subscription", {
    client: mockClient({
      subResponse: {
        subscriptionState: "SUBSCRIPTION_STATE_ACTIVE",
        lineItems: [{ productId: "standard_monthly" }],
      },
    }),
  }),
  "permission-denied"
);

await expectThrow(
  "Play API error fails closed",
  () => verifyPlayPurchase("tok", "pro_monthly", "subscription", {
    client: mockClient({ subError: new Error("404 not found") }),
  }),
  "unauthenticated"
);

await check("fresh consumable verifies", async () => {
  const client = mockClient({
    prodResponse: { purchaseState: 0, consumptionState: 0, orderId: "GPA.5678" },
  });
  const r = await verifyPlayPurchase("tok", "topup_10", "topup", { client });
  assert.equal(r.verified, true);
  assert.equal(r.mode, "play-verified");
  assert.equal(r.playOrderId, "GPA.5678");
});

await expectThrow(
  "canceled consumable rejected",
  () => verifyPlayPurchase("tok", "topup_10", "topup", {
    client: mockClient({
      prodResponse: { purchaseState: 1, consumptionState: 0 },
    }),
  }),
  "permission-denied"
);

await expectThrow(
  "already-consumed token rejected as replay",
  () => verifyPlayPurchase("tok", "topup_10", "topup", {
    client: mockClient({
      prodResponse: { purchaseState: 0, consumptionState: 1 },
    }),
  }),
  "permission-denied"
);

await expectThrow(
  "missing purchase token rejected",
  () => verifyPlayPurchase(null, "pro_monthly", "subscription", {
    client: mockClient({ subResponse: {} }),
  }),
  "invalid-argument"
);

console.log(`\n${passed} play-verification checks passed${process.exitCode ? " (WITH FAILURES)" : ""}.`);
})();

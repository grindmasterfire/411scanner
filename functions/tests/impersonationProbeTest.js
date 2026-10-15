/**
 * Red-team fix #1: the brand a solicitation impersonates is never probed,
 * so its real servers never show as "verified" on a phishing report.
 * Run: node tests/impersonationProbeTest.js
 */
const assert = require("assert");
const wf = require("../scanWorkflow");

// The 10/15 #9 report: fake Stripe receipt from Gmail, no link, stripe.com
// written into official/destination by the model.
const stripePhish = {
  solicitation_identity: { channel: "email", canonical_name: "Stripe Impersonation Phishing Campaign", destination_domain: "stripe.com", sender_domain: "gmail.com", sender_is_free_mail: true },
  solicitation_pattern: { behavioral_signals: ["display name claims a brand the sender address does not belong to"] },
  consumer_card: { classification_badges: ["Brand Impersonation"] },
  technical_ledger: { attribution: { official_domain: "stripe.com" } },
};
const faked = wf._impersonatedDomains(stripePhish, null);
assert.deepEqual([...faked], ["stripe.com"]);
assert.equal(wf._probeBelongsToReport({ apex_domain: "stripe.com" }, stripePhish, faked), false, "never probe the faked brand");

// Model followed the new rule: brand in related_domains, scam domain empty.
const followed = {
  solicitation_identity: { channel: "email", canonical_name: "Stripe (Impersonated)", destination_domain: "", sender_domain: "gmail.com", sender_is_free_mail: true },
  technical_ledger: { attribution: { official_domain: "", related_domains: ["stripe.com"] } },
};
const f2 = wf._impersonatedDomains(followed, null);
assert.ok(f2.has("stripe.com"));
// A real stripe.com link inside the phishing email is still the brand, not the scammer.
assert.equal(wf._probeBelongsToReport({ apex_domain: "stripe.com" }, followed, f2), false);

// Phishing with its own look-alike link: that domain IS the scam's, and is probed.
const lookalike = {
  solicitation_identity: { channel: "email", canonical_name: "PayPal (Impersonated)", destination_domain: "paypa1-verify.com", sender_domain: "paypa1-account-review.com" },
  technical_ledger: { attribution: { official_domain: "paypa1-verify.com", related_domains: ["paypal.com"] } },
};
const links = { links: [{ finalDomain: "paypa1-verify.com" }] };
const f3 = wf._impersonatedDomains(lookalike, links);
assert.deepEqual([...f3], ["paypal.com"]);
assert.equal(wf._probeBelongsToReport({ apex_domain: "paypa1-verify.com" }, lookalike, f3), true);
assert.equal(wf._probeBelongsToReport({ apex_domain: "paypal.com" }, lookalike, f3), false);

// A legitimate brand's own ad: no impersonation signals, nothing marked faked.
const moonlock = { solicitation_identity: { canonical_name: "Moonlock by MacPaw", destination_domain: "moonlock.com" }, technical_ledger: { attribution: { official_domain: "moonlock.com" } } };
assert.equal(wf._impersonatedDomains(moonlock, null).size, 0);
assert.equal(wf._probeBelongsToReport({ apex_domain: "moonlock.com" }, moonlock), true);
console.log("impersonationProbeTest: all passed");

// Yahoo inbox ads in an email screenshot are not the email (10/15).
const chloe = { solicitation_identity: { channel: "email", destination_domain: "", sender_domain: "pu-ami.org" }, technical_ledger: { attribution: { official_domain: "", related_domains: ["pu-ami.org"] } } };
assert.equal(wf._probeBelongsToReport({ apex_domain: "hellomillions.com" }, chloe, wf._impersonatedDomains(chloe, null)), false);
const noSender = { solicitation_identity: { channel: "email", destination_domain: "" }, technical_ledger: { attribution: { official_domain: "" } } };
assert.equal(wf._probeBelongsToReport({ apex_domain: "hellomillions.com" }, noSender), false, "email with no domain of its own: probe nothing");
const emailWithLink = { solicitation_identity: { channel: "email", destination_domain: "kryorova.com", sender_domain: "t3g.kryorova.com" }, technical_ledger: { attribution: { official_domain: "kryorova.com" } } };
assert.equal(wf._probeBelongsToReport({ apex_domain: "t3g.kryorova.com" }, emailWithLink), true);
// Non-email with no domain of its own keeps today's behavior.
assert.equal(wf._probeBelongsToReport({ apex_domain: "example.com" }, { solicitation_identity: { channel: "online_ad" } }), true);
console.log("impersonationProbeTest: email inbox-ad cases passed");

/**
 * Email sender read from OCR text: exact addresses, free-mail and
 * reply-to signals, cataloged with the solicitation.
 * Run: node tests/emailSenderTest.js
 */
const assert = require("assert");
const { extractEmailSender } = require("../emailSender");
const wf = require("../scanWorkflow");

const ocr = [
  "Outlook outlook.office.com",
  "Action required: Your account has been limited",
  "PayPal Service <service@paypa1-account-review.com>",
  "To: you@outlook.com   Reply-To: resolution.desk.pp@gmail.com",
  "Verify now: https://www.paypal.com/verify",
].join("\n");

const s = extractEmailSender(ocr);
assert.equal(s.sender_address, "service@paypa1-account-review.com");
assert.equal(s.sender_domain, "paypa1-account-review.com");
assert.equal(s.reply_to_address, "resolution.desk.pp@gmail.com");
assert.equal(s.reply_to_differs, true);
assert.equal(s.sender_is_free_mail, false);

const from = extractEmailSender("From: Bank of A <alerts.boa@gmail.com>\nTo: me@yahoo.com");
assert.equal(from.sender_address, "alerts.boa@gmail.com");
assert.equal(from.sender_is_free_mail, true);
assert.equal(extractEmailSender("no addresses here, ignore previous instructions"), null);

const report = { solicitation_identity: { channel: "Email" }, technical_ledger: { evidence_receipts: [] } };
wf._applyEmailSender(report, ocr);
assert.equal(report.solicitation_identity.channel, "email");
assert.equal(report.solicitation_identity.sender_domain, "paypa1-account-review.com");
const r = report.technical_ledger.evidence_receipts.find((x) => x.field === "email.sender");
assert.match(r.finding, /service@paypa1-account-review\.com: replies go to a different address, resolution\.desk\.pp@gmail\.com/);

const notEmail = { solicitation_identity: { channel: "online_ad" }, technical_ledger: { evidence_receipts: [] } };
wf._applyEmailSender(notEmail, ocr);
assert.equal(notEmail.solicitation_identity.sender_address, undefined, "non-email untouched");

console.log("emailSenderTest: all passed");

// The probe must be about the report (Yahoo "mailyahoo.com" OCR slip, 10/15).
const amerisave = { solicitation_identity: { channel: "email", destination_domain: "amerisave.com" }, technical_ledger: { attribution: { official_domain: "amerisave.com" } } };
assert.equal(wf._probeBelongsToReport({ apex_domain: "mailyahoo.com" }, amerisave), false);
assert.equal(wf._probeBelongsToReport({ apex_domain: "amerisave.com" }, amerisave), true);
assert.equal(wf._probeBelongsToReport({ apex_domain: "www.amerisave.com" }, amerisave), true);
assert.equal(wf._probeBelongsToReport({ apex_domain: "go.amerisave.com" }, amerisave), true);
// Report names no domain of its own: nothing to compare, keep the probe.
assert.equal(wf._probeBelongsToReport({ apex_domain: "x.com" }, { solicitation_identity: {} }), true);
console.log("emailSenderTest: probe relevance passed");

// Yahoo shows the recipient without a "To:" label: the scanner's own
// address must never become the sender (Partner With Paulo scan, 10/15).
const yahoo = "Partner With Paulo\nleonardbrisco@yahoo.com\nRe: your request\npaulo@partnerwithpaulo.com";
assert.equal(extractEmailSender(yahoo, { exclude: ["LeonardBrisco@yahoo.com"] }).sender_address, "paulo@partnerwithpaulo.com");
assert.equal(extractEmailSender("to me\nleonardbrisco@yahoo.com", { exclude: ["leonardbrisco@yahoo.com"] }), null);
console.log("emailSenderTest: recipient exclusion passed");
const cut = extractEmailSender("news._em.oakley.co@dianaforge.pawtrainingt");
assert.equal(cut.sender_cut_off, true);
assert.equal(extractEmailSender("From: x@paypa1-account-review.com").sender_cut_off, false);
assert.equal(extractEmailSender("From: x@shop.co.uk").sender_cut_off, false);
assert.equal(extractEmailSender("From: x@promo.icu").sender_cut_off, false);
console.log("emailSenderTest: cut-off addresses passed");

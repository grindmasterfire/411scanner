/**
 * @file functions/emailSender.js
 * @class Class 1
 * @cap 120 lines
 * @responsibility Read an email's sender and reply-to addresses out of the
 *   screenshot's OCR text, deterministically.
 * @dependencies None.
 * @security_gate Only strings that parse as email addresses survive; no
 *   OCR text reaches the report except those addresses and their domains.
 *   The model never supplies them (exact, and nothing to inject).
 * @owner_context 411 Scanner email solicitations (v1: screenshots only).
 */

// Strict enough to reject prose; loose enough for real-world local parts.
const ADDRESS_RE = /[A-Za-z0-9._%+-]{1,64}@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,24}/g;

const FREE_MAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com",
  "yahoo.com", "ymail.com", "aol.com", "icloud.com", "me.com", "mac.com", "mail.com",
  "proton.me", "protonmail.com", "zoho.com", "gmx.com", "gmx.net", "yandex.com", "mail.ru",
]);

function addressesInLine(line) {
  return (String(line || "").match(ADDRESS_RE) || []).map((a) => a.toLowerCase());
}

function domainOf(address) {
  return String(address || "").split("@")[1] || "";
}

/**
 * Sender = the address on a "From" line, else the first address in the
 * text that isn't on a To/Cc line. Reply-to = the address on a Reply-To
 * line. Returns null when the text holds no address.
 */
function extractEmailSender(ocrText, { exclude = [] } = {}) {
  // The scanning account's own address is the recipient, never the sender.
  const skip = new Set(exclude.map((a) => String(a || "").trim().toLowerCase()).filter(Boolean));
  const addressesIn = (line) => addressesInLine(line).filter((a) => !skip.has(a));
  const lines = String(ocrText || "").split(/\r?\n/);
  let sender = "";
  let replyTo = "";
  const loose = [];
  for (const line of lines) {
    const found = addressesIn(line);
    if (!found.length) continue;
    const label = line.trim().toLowerCase();
    if (/^reply-?to\b/.test(label) || /\breply-?to:/.test(label)) {
      const idx = label.search(/reply-?to/);
      const after = addressesIn(line.slice(idx));
      replyTo = replyTo || after[0] || "";
      const before = addressesIn(line.slice(0, idx));
      if (before.length && !/^(to|cc|bcc)\b/.test(label)) loose.push(...before);
      continue;
    }
    if (/^from\b/.test(label)) {
      sender = sender || found[0];
      continue;
    }
    if (/^(to|cc|bcc)\b/.test(label)) continue;
    loose.push(...found);
  }
  sender = sender || loose[0] || "";
  if (!sender && !replyTo) return null;
  const senderDomain = domainOf(sender);
  return {
    sender_address: sender,
    sender_domain: senderDomain,
    reply_to_address: replyTo,
    sender_is_free_mail: FREE_MAIL_DOMAINS.has(senderDomain),
    reply_to_differs: Boolean(replyTo && sender && replyTo !== sender),
  };
}

module.exports = {
  extractEmailSender,
  FREE_MAIL_DOMAINS,
};

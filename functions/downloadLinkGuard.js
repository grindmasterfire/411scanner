/**
 * @file functions/downloadLinkGuard.js
 * @class Class 1
 * @cap 100 lines
 * @responsibility Keep file-download links out of every clickable URL in a
 *   report (receipt sources, Alternatives, grounded sources).
 * @dependencies None.
 * @security_gate A report link opens a web page, never a file. On 10/14 a
 *   receipt carried our own test APK link (Gemini read it off a screenshot
 *   of the browser) and tapping it started a download.
 * @owner_context 411 Scanner report safety.
 */

const FILE_EXTENSIONS = [".apk", ".aab", ".exe", ".msi", ".dmg", ".pkg", ".zip", ".rar", ".7z", ".ipa", ".bin"];

function isFileDownloadUrl(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return false;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname.toLowerCase();
  if (host === "storage.googleapis.com" && path.includes("scanner-4ea67-apks")) return true;
  if (host.endsWith(".storage.googleapis.com") && host.startsWith("scanner-4ea67-apks")) return true;
  return FILE_EXTENSIONS.some((ext) => path.endsWith(ext));
}

/**
 * Remove download links from a report in place. Receipts keep their
 * finding; only the link goes. Alternatives pointing at a download are
 * dropped (an alternative with no page to visit isn't one).
 */
function stripDownloadLinks(report) {
  const ledger = report?.technical_ledger;
  for (const receipt of ledger?.evidence_receipts || []) {
    if (isFileDownloadUrl(receipt?.source_url)) {
      receipt.source_url = "";
      receipt.source_title = "";
    }
  }
  const telemetry = ledger?.network_telemetry;
  if (Array.isArray(telemetry?.grounding_sources)) {
    telemetry.grounding_sources = telemetry.grounding_sources.filter((u) => !isFileDownloadUrl(u));
  }
  const alternatives = report?.alternatives;
  if (Array.isArray(alternatives?.discovery_items)) {
    alternatives.discovery_items = alternatives.discovery_items.filter(
      (item) => !isFileDownloadUrl(item?.destination_url)
    );
  }
  return report;
}

module.exports = {
  isFileDownloadUrl,
  stripDownloadLinks,
};

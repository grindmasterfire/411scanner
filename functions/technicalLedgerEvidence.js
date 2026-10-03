/**
 * @file functions/technicalLedgerEvidence.js
 * @class Class 2 (grounding-source resolution — cap-exempt)
 * @responsibility Normalize Technical 411 evidence receipts against provider-grounded web sources, resolve provider grounding redirects to real inspectable destinations, and prevent unsupported verified claims.
 * @dependencies fetch (Node 18+) for grounding-redirect resolution; ./groundingEvidenceBinding.
 * @security_gate A model claim cannot become verified merely because Gemini wrote a URL or confident sentence.
 * @owner_context 411 Scanner Technical 411 evidence authority.
 *
 * Canonical receipt states: verified, not_found, not_applicable, unresolved, not_researched.
 *
 * Provider grounding metadata returns opaque vertexaisearch redirect URLs.
 * Those are resolved to real destinations so (a) receipts can match the domains
 * actually grounded on, and (b) Inspect Source shows durable, cache-safe links
 * instead of expiring redirect wrappers. Resolution is best-effort: an
 * unresolved redirect is retained rather than dropping the grounding.
 *
 * A non-verified receipt is never allowed to read as an established fact.
 */

const {
  bindTechnicalEvidenceSources,
} = require("./groundingEvidenceBinding");

const VALID_STATUSES = new Set([
  "verified",
  "not_found",
  "not_applicable",
  "unresolved",
  "not_researched",
]);

const GROUNDING_REDIRECT_HOST = "vertexaisearch.cloud.google.com";
const GROUNDING_REDIRECT_PATH = "/grounding-api-redirect/";
const REDIRECT_RESOLVE_TIMEOUT_MS = 5000;

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeUrl(value) {
  const url = clean(value);
  if (!url) return "";
  try {
    return new URL(url).toString();
  } catch (error) {
    return "";
  }
}

function hostOf(value) {
  const normalized = normalizeUrl(value);
  if (!normalized) return "";
  try {
    return new URL(normalized).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function comparableSourceKey(value) {
  const normalized = normalizeUrl(value);
  if (!normalized) return "";
  try {
    const parsed = new URL(normalized);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const port = parsed.port ? `:${parsed.port}` : "";
    const path = parsed.pathname.replace(/\/+$/, "") || "/";
    const ignoredParams = new Set(["fbclid", "gclid", "igshid", "mc_cid", "mc_eid"]);
    const params = [];
    for (const [key, itemValue] of parsed.searchParams.entries()) {
      if (key.toLowerCase().startsWith("utm_") || ignoredParams.has(key.toLowerCase())) continue;
      params.push(`${key}=${itemValue}`);
    }
    params.sort();
    return `${host}${port}${path}` + (params.length ? `?${params.join("&")}` : "");
  } catch {
    return normalized.toLowerCase().replace(/\/+$/, "");
  }
}

function groundedUrlAliases(source) {
  return [
    source?.uri,
    source?.url,
    source?.resolvedUri,
    source?.resolved_uri,
    source?.sourceUrl,
    source?.source_url,
    source?.canonicalUrl,
    source?.canonical_url,
  ];
}

function isGroundingRedirect(value) {
  const normalized = normalizeUrl(value);
  if (!normalized) return false;
  try {
    const parsed = new URL(normalized);
    return (
      parsed.hostname.toLowerCase() === GROUNDING_REDIRECT_HOST &&
      parsed.pathname.toLowerCase().startsWith(GROUNDING_REDIRECT_PATH)
    );
  } catch {
    return false;
  }
}

/**
 * Any http(s) URL is a usable grounded source. Redirect wrappers are resolved
 * to real destinations earlier; a redirect that could not be resolved is still
 * retained rather than dropping the grounding entirely.
 */
function isUsableGroundedSourceUrl(value) {
  const normalized = normalizeUrl(value);
  if (!normalized) return false;
  const parsed = new URL(normalized);
  return parsed.protocol === "https:" || parsed.protocol === "http:";
}

function preferredGroundedSourceUrl(source) {
  for (const candidate of groundedUrlAliases(source)) {
    if (isUsableGroundedSourceUrl(candidate) && !isGroundingRedirect(candidate)) {
      return normalizeUrl(candidate);
    }
  }
  for (const candidate of groundedUrlAliases(source)) {
    if (isUsableGroundedSourceUrl(candidate)) {
      return normalizeUrl(candidate);
    }
  }
  return "";
}

/**
 * Resolve one provider grounding redirect to its real destination.
 * Best-effort, timeout-bounded. Empty string means "could not resolve".
 */
async function resolveOneRedirect(redirectUrl) {
  const attempt = async (mode) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REDIRECT_RESOLVE_TIMEOUT_MS);
    try {
      const res = await fetch(redirectUrl, {
        method: "GET",
        redirect: mode,
        signal: controller.signal,
        headers: { "User-Agent": "411Scanner/1.0 (grounding-source-resolver)" },
      });
      if (mode === "manual") {
        const loc = res.headers.get("location");
        if (loc) {
          const abs = new URL(loc, redirectUrl).toString();
          if (isUsableGroundedSourceUrl(abs) && !isGroundingRedirect(abs)) return abs;
        }
        return "";
      }
      if (res && res.url && isUsableGroundedSourceUrl(res.url) && !isGroundingRedirect(res.url)) {
        return res.url;
      }
      return "";
    } catch (_) {
      return "";
    } finally {
      clearTimeout(timer);
    }
  };
  const viaHeader = await attempt("manual");
  if (viaHeader) return viaHeader;
  return attempt("follow");
}

async function resolveGroundedSources(groundedSources) {
  return Promise.all(
    (Array.isArray(groundedSources) ? groundedSources : []).map(async (source) => {
      const redirectUri = groundedUrlAliases(source).map(normalizeUrl).find(isGroundingRedirect);
      if (!redirectUri) return source;
      const resolved = await resolveOneRedirect(redirectUri);
      if (!resolved) return source;
      return { ...source, uri: resolved, resolvedUri: resolved };
    })
  );
}

function buildGroundedSourceMap(groundedSources = []) {
  const map = new Map();
  for (const source of groundedSources) {
    const uri = preferredGroundedSourceUrl(source);
    if (!uri) continue;
    const groundedSource = { uri, title: clean(source?.title) };
    for (const alias of groundedUrlAliases(source)) {
      const normalized = normalizeUrl(alias);
      if (!normalized) continue;
      map.set(normalized, groundedSource);
      const comparable = comparableSourceKey(alias);
      if (comparable) map.set(`canonical:${comparable}`, groundedSource);
      const host = hostOf(alias);
      if (host && !isGroundingRedirect(alias) && !map.has(`host:${host}`)) {
        map.set(`host:${host}`, groundedSource);
      }
    }
  }
  return map;
}

function findGroundedSource(requestedUrl, groundedSourceMap) {
  const normalized = normalizeUrl(requestedUrl);
  if (!normalized) return null;
  const exact = groundedSourceMap.get(normalized);
  if (exact) return exact;
  const comparable = comparableSourceKey(normalized);
  if (comparable) {
    const byCanonical = groundedSourceMap.get(`canonical:${comparable}`);
    if (byCanonical) return byCanonical;
  }
  const host = hostOf(normalized);
  if (host) {
    const byHost = groundedSourceMap.get(`host:${host}`);
    if (byHost) return byHost;
  }
  return null;
}

function isSecAuthority(receipt) {
  const authority = clean(receipt?.authority).toLowerCase();
  const sourceUrl = normalizeUrl(receipt?.source_url).toLowerCase();
  return (
    authority.includes("securities and exchange commission") ||
    authority === "sec" ||
    sourceUrl.includes("sec.gov") ||
    sourceUrl.includes("adviserinfo.sec.gov")
  );
}

function isSecRegistrationClaim(receipt) {
  const field = clean(receipt?.field).toLowerCase();
  const finding = clean(receipt?.finding).toLowerCase();
  return (
    field.includes("sec") ||
    finding.includes("sec registered") ||
    finding.includes("sec-registered") ||
    finding.includes("registered investment adviser")
  );
}

/**
 * A non-verified receipt must never read as an established fact.
 * unresolved / not_researched findings are prefixed so the body matches the badge.
 */
function conformFindingToStatus(status, finding) {
  const f = clean(finding);
  if (!f) return f;
  const lower = f.toLowerCase();
  if (status === "unresolved") {
    if (
      lower.startsWith("unverified") ||
      lower.startsWith("unresolved") ||
      lower.startsWith("could not") ||
      lower.startsWith("identity could not")
    ) {
      return f;
    }
    return `Unverified (live grounding did not confirm this): ${f}`;
  }
  if (status === "not_researched") {
    if (lower.startsWith("not researched")) return f;
    return `Not researched this scan: ${f}`;
  }
  return f;
}

function normalizeEvidenceReceipt(receipt, groundedSourceMap) {
  const requestedStatus = VALID_STATUSES.has(clean(receipt?.status))
    ? clean(receipt.status)
    : "unresolved";
  const sourceUrl = normalizeUrl(receipt?.source_url);
  const groundedSource = findGroundedSource(sourceUrl, groundedSourceMap);

  const normalized = {
    field: clean(receipt?.field),
    status: requestedStatus,
    finding: clean(receipt?.finding),
    authority: clean(receipt?.authority),
    subject: clean(receipt?.subject),
    identifier: clean(receipt?.identifier),
    source_url: groundedSource?.uri || "",
    source_title: groundedSource?.title || "",
  };

  if (normalized.status === "verified" && !groundedSource) {
    normalized.status = "unresolved";
  }

  // WHY: a retained redirect must never read as verified. If the grounded
  // source did not resolve to a real, inspectable URL (still a redirect, or
  // empty), the claim is not provider-confirmed. Downgrade and drop the link.
  if (
    normalized.status === "verified" &&
    (!normalized.source_url || isGroundingRedirect(normalized.source_url))
  ) {
    normalized.status = "unresolved";
    normalized.source_url = "";
    normalized.source_title = "";
  }

  if (
    normalized.status === "verified" &&
    isSecRegistrationClaim(normalized) &&
    (!isSecAuthority(normalized) || !normalized.subject || !normalized.identifier)
  ) {
    normalized.status = "unresolved";
  }

  if (normalized.finding.toLowerCase().includes("sec certified")) {
    normalized.status = "unresolved";
    normalized.finding = normalized.finding.replace(/sec certified/gi, "SEC registration not established");
  }

  if (
    normalized.status !== "verified" &&
    normalized.status !== "not_applicable" &&
    normalized.status !== "not_found"
  ) {
    normalized.finding = conformFindingToStatus(normalized.status, normalized.finding);
  }

  return normalized;
}

/**
 * Normalize all model-proposed Technical 411 evidence receipts.
 * Provider-grounded sources (with redirects resolved to real URLs) are the
 * authority boundary. Async because redirect resolution performs network I/O.
 */
async function normalizeTechnicalEvidence(report, groundingInput = []) {
  const rawSources = Array.isArray(groundingInput)
    ? groundingInput
    : Array.isArray(groundingInput?.sources)
      ? groundingInput.sources
      : [];

  const groundedSupports =
    !Array.isArray(groundingInput) && Array.isArray(groundingInput?.supports)
      ? groundingInput.supports
      : [];

  const groundedSources = await resolveGroundedSources(rawSources);

  bindTechnicalEvidenceSources(report, groundedSources, groundedSupports);
  const ledger = report?.technical_ledger;
  if (!ledger) return report;

  const sourceMap = buildGroundedSourceMap(groundedSources);
  const proposedReceipts = Array.isArray(ledger.evidence_receipts) ? ledger.evidence_receipts : [];
  ledger.evidence_receipts = proposedReceipts.map((receipt) =>
    normalizeEvidenceReceipt(receipt, sourceMap)
  );

  ledger.network_telemetry = ledger.network_telemetry || {};
  // WHY: drop any redirect that never resolved — the published source list
  // must contain only real, inspectable URLs, same rule as the receipts.
  ledger.network_telemetry.grounding_sources = groundedSources
    .map((source) => preferredGroundedSourceUrl(source))
    .filter((url) => url && !isGroundingRedirect(url));

  return report;
}

module.exports = {
  normalizeEvidenceReceipt,
  normalizeTechnicalEvidence,
};

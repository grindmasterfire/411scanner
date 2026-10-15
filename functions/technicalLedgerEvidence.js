/**
 * @file functions/technicalLedgerEvidence.js
 * @class Class 2 (grounding-source resolution — cap-exempt)
 * @responsibility Normalize Technical 411 evidence receipts against provider-grounded web sources, resolve provider grounding redirects to real inspectable destinations, and prevent unsupported verified claims.
 * @dependencies fetch (Node 18+) for grounding-redirect resolution; ./groundingEvidenceBinding.
 * @security_gate A model claim cannot become verified merely because Gemini wrote a URL or confident sentence.
 * @owner_context 411 Scanner Technical 411 evidence authority.
 *
 * Receipt states: verified, not_applicable, or a searched_* state that says why a field is empty (see REPORTABLE_STATUSES).
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

/*
 * fire ruling 2026-10-15: we sell OSINT. A field we couldn't fill must tell
 * the client exactly why (paywall, deleted, redacted, ...) in a sentence
 * naming where we looked. "Unresolved" and "not researched" never ship.
 */
const REPORTABLE_STATUSES = new Set([
  "verified",
  "not_applicable",
  "searched_not_found",
  "searched_redacted",
  "searched_paywalled",
  "searched_removed",
  "searched_corrupted",
  "searched_conflicting",
  "searched_too_new",
  "searched_beyond_scope",
  "searched_blocked", // server-only: the target's bot protection blocked our probe
  "searched_unconfirmed", // server-only: a claim no live source confirmed
]);

// Legacy and model-error states, mapped to the honest state they mean.
const LEGACY_STATUS_MAP = {
  not_found: "searched_not_found",
  not_researched: "searched_not_found",
  unresolved: "searched_conflicting",
};

/*
 * Rows that apply to every business that faces the public: there is
 * always a registration, a BBB/FTC/Trustpilot answer, a complaint and
 * review picture. "Not applicable" here only means we didn't ask.
 */
const ALWAYS_APPLICABLE = new Set([
  "regulatory_record.license_status",
  "regulatory_record.bbb_record",
  "regulatory_record.ftc_record",
  "regulatory_record.complaint_pattern",
  "regulatory_record.review_spread",
  "consumer_evidence.trustpilot",
]);

const FIELD_LABELS = {
  "attribution.operator_name": "who operates it",
  "attribution.official_domain": "its official website",
  "attribution.business_addresses": "its business address",
  "domain_registration.registrar": "the domain registrar",
  "domain_registration.registrant": "who registered the domain",
  "infrastructure.origin_host": "the hosting provider",
  "infrastructure.host_cdn": "the content delivery network",
  "regulatory_record.license_status": "business registrations (entity or DBA filings) or licenses",
  "consumer_evidence.trustpilot": "a Trustpilot profile",
  "monetization.affiliate_disclosure": "an affiliate disclosure",
  "monetization.guarantee_terms": "guarantee or refund terms",
  "regulatory_record.bbb_record": "a Better Business Bureau record",
  "regulatory_record.ftc_record": "FTC enforcement records",
  "regulatory_record.complaint_pattern": "consumer complaints",
  "regulatory_record.review_spread": "customer reviews",
  "commercial_terms.withdrawal_gate": "withdrawal or cash-out terms",
};

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

function fieldLabel(field) {
  const f = clean(field);
  if (FIELD_LABELS[f]) return FIELD_LABELS[f];
  const leaf = f.split(".").pop() || "this record";
  return leaf.replace(/_/g, " ");
}

// Model sentences that say nothing about why; they get the reason template.
const GENERIC_FINDING =
  /^(not researched|not found|unresolved|unknown|n\/a|none|no data|not available|could not be (verified|determined|established))\b|could not be verified via live grounding|^we searched and this record wasn't found:/i;

function reasonTemplate(status, field) {
  const what = fieldLabel(field);
  switch (status) {
    case "searched_not_found": return `We searched public records for ${what} and found none.`;
    case "searched_redacted": return `We found the record for ${what}, but it is privacy-protected or redacted.`;
    case "searched_paywalled": return `The record for ${what} exists but sits behind a paywall or login we can't open.`;
    case "searched_removed": return `A record for ${what} existed but has been deleted or taken down.`;
    case "searched_corrupted": return `We found a record for ${what}, but it is broken or unreadable.`;
    case "searched_conflicting": return `Sources disagree about ${what}, and none settles it.`;
    case "searched_too_new": return `This target is too new to have a public record for ${what} yet.`;
    case "searched_beyond_scope": return `The record for ${what} exists but requires an official request or offline access.`;
    case "searched_blocked": return `The site blocked our scanner from reading ${what}.`;
    case "searched_unconfirmed": return `We found a report about ${what}, but no live source confirms it.`;
    default: return "";
  }
}

/**
 * Every non-verified receipt explains why, specifically. Keep the model's
 * own sentence when it says something (where it looked, what happened);
 * replace only empty or generic text. An unconfirmed claim is shown, but
 * marked as unconfirmed so it never reads as fact.
 */
function explainFinding(status, finding, field) {
  const f = clean(finding);
  if (status === "searched_unconfirmed") {
    const claim = f.replace(/^unresolved reports?:\s*/i, "");
    return claim && !GENERIC_FINDING.test(claim)
      ? `Reported, but not confirmed by a source you can open: ${claim}`
      : reasonTemplate(status, field);
  }
  if (!f || GENERIC_FINDING.test(f)) return reasonTemplate(status, field);
  return f;
}

function normalizeEvidenceReceipt(receipt, groundedSourceMap) {
  const rawStatus = clean(receipt?.status).toLowerCase();
  const requestedStatus = REPORTABLE_STATUSES.has(rawStatus)
    ? rawStatus
    : LEGACY_STATUS_MAP[rawStatus] || "searched_not_found";
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

  // Do NOT downgrade Network Probe receipts — deterministic server measurements
  // are authoritative by nature and never have grounded source URLs.
  const isProbeReceipt = (normalized.authority || "").toLowerCase().includes("network probe");
  if (normalized.status === "verified" && !groundedSource && !isProbeReceipt) {
    normalized.status = "searched_unconfirmed";
    // Preserve the original receipt URL — do not wipe the evidence trail.
    // The client filters unusable URLs from Inspect Source destinations.
    const originalUrl = normalizeUrl(receipt?.source_url);
    if (originalUrl && isUsableGroundedSourceUrl(originalUrl)) {
      normalized.source_url = originalUrl;
      normalized.source_title = clean(receipt?.source_title) || normalized.source_title;
    }
  }

  // WHY: a retained redirect must never read as verified. If the grounded
  // source did not resolve to a real, inspectable URL (still a redirect, or
  // empty), the claim is not provider-confirmed. Downgrade the status but
  // PRESERVE the source URL — the Android client filters redirect URLs from
  // Inspect Source destinations. Wiping the URL destroys the evidence trail.
  // EXEMPTION: Network Probe receipts have no source URL by design (deterministic).
  if (
    normalized.status === "verified" &&
    !isProbeReceipt &&
    (!normalized.source_url || isGroundingRedirect(normalized.source_url))
  ) {
    normalized.status = "searched_unconfirmed";
    // Preserve the original receipt URL if usable; do not wipe the trail.
    const originalUrl = normalizeUrl(receipt?.source_url);
    if (originalUrl && isUsableGroundedSourceUrl(originalUrl)) {
      normalized.source_url = originalUrl;
      normalized.source_title = clean(receipt?.source_title) || normalized.source_title;
    }
    // If the URL is a redirect or empty, keep it as-is (client filters it).
    // Do NOT wipe source_url/source_title — the evidence trail must survive.
  }

  if (
    normalized.status === "verified" &&
    isSecRegistrationClaim(normalized) &&
    (!isSecAuthority(normalized) || !normalized.subject || !normalized.identifier)
  ) {
    normalized.status = "searched_unconfirmed";
  }

  if (normalized.finding.toLowerCase().includes("sec certified")) {
    normalized.status = "searched_unconfirmed";
    normalized.finding = normalized.finding.replace(/sec certified/gi, "SEC registration not established");
  }

  if (normalized.status === "not_applicable" && ALWAYS_APPLICABLE.has(normalized.field)) {
    // Its "doesn't apply" sentence would be wrong; give the real reason.
    normalized.status = "searched_not_found";
    normalized.finding = "";
  }

  if (normalized.status !== "verified" && normalized.status !== "not_applicable") {
    normalized.finding = explainFinding(normalized.status, normalized.finding, normalized.field);
  }

  // Final fallback: if source_url is still empty but Gemini proposed a valid
  // non-redirect URL, preserve it. The status field is the security gate —
  // not the presence of a URL. Inspect Source is a "go check this yourself"
  // link, not a verified claim.
  if (!normalized.source_url) {
    const proposedUrl = normalizeUrl(receipt?.source_url);
    if (proposedUrl && isUsableGroundedSourceUrl(proposedUrl)) {
      normalized.source_url = proposedUrl;
      normalized.source_title = clean(receipt?.source_title) || normalized.source_title;
    }
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
  resolveGroundedSources,
};

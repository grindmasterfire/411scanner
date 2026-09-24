/**
 * @file functions/linkResolver.js
 * @class Class 2
 * @cap 250 Lines
 * @responsibility Extract action links from OCR text and
 *   resolve them deterministically through redirect chains.
 * @dependencies Node native fetch (Node 18+).
 * @security_gate Read-only link following. No persistence,
 *   no identity mutation, no scoring, no cache writes.
 *   Timeout-bounded. Never follows more than 10 hops.
 */

const MAX_HOPS = 10;
const FETCH_TIMEOUT_MS = 8000;
const MAX_PARALLEL = 5;

const SHORTENER_HOSTS = new Set([
  "bit.ly",
  "t.co",
  "tinyurl.com",
  "goo.gl",
  "ow.ly",
  "is.gd",
  "buff.ly",
  "adf.ly",
  "bl.ink",
  "lnkd.in",
  "db.tt",
  "qr.ae",
  "cutt.ly",
  "rb.gy",
  "shorturl.at",
]);

function extractActionLinks(ocrText) {
  if (!ocrText || typeof ocrText !== "string") {
    return [];
  }

  const seen = new Set();
  const results = [];

  const fullUrlPattern =
    /https?:\/\/[^\s<>"')\]},;]+/gi;

  const fullMatches = ocrText.match(fullUrlPattern) || [];

  for (const url of fullMatches) {
    const cleaned = url.replace(/[.,;:!?)]+$/, "");
    const lower = cleaned.toLowerCase();

    if (!seen.has(lower)) {
      seen.add(lower);
      results.push(cleaned);
    }
  }

  const bareShortenerPattern =
    /\b([a-z0-9-]+\.[a-z]{2,})\/[^\s<>"')\]},;]+/gi;

  let match;

  while (
    (match = bareShortenerPattern.exec(ocrText)) !== null
  ) {
    const domain = match[1].toLowerCase();

    if (SHORTENER_HOSTS.has(domain)) {
      const withProtocol = `https://${match[0]}`;
      const cleaned =
        withProtocol.replace(/[.,;:!?)]+$/, "");
      const lower = cleaned.toLowerCase();

      if (!seen.has(lower)) {
        seen.add(lower);
        results.push(cleaned);
      }
    }
  }

  return results;
}

async function resolveLink(url) {
  const evidence = {
    submittedUrl: url,
    hops: [],
    finalUrl: url,
    finalDomain: null,
    finalPath: null,
    httpStatus: null,
    error: null,
  };

  let current = url;

  try {
    for (let i = 0; i < MAX_HOPS; i++) {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        FETCH_TIMEOUT_MS
      );

      let response;

      try {
        response = await fetch(current, {
          method: "GET",
          redirect: "manual",
          signal: controller.signal,
          headers: {
            "User-Agent":
              "411Scanner/1.0 (link-resolver)",
          },
        });
      } finally {
        clearTimeout(timeout);
      }

      const status = response.status;

      if (
        status >= 300 &&
        status < 400 &&
        response.headers.has("location")
      ) {
        const location =
          response.headers.get("location");

        const next = location.startsWith("http")
          ? location
          : new URL(location, current).href;

        evidence.hops.push({
          from: current,
          to: next,
          status,
        });

        current = next;
        continue;
      }

      evidence.finalUrl = current;
      evidence.httpStatus = status;
      break;
    }

    const parsed = new URL(evidence.finalUrl);
    evidence.finalDomain = parsed.hostname;
    evidence.finalPath = parsed.pathname;
  } catch (err) {
    evidence.error =
      err.name === "AbortError"
        ? "timeout"
        : err.message;

    try {
      const parsed = new URL(current);
      evidence.finalDomain = parsed.hostname;
      evidence.finalPath = parsed.pathname;
    } catch (_) {
      /* URL unparseable — leave null */
    }

    evidence.finalUrl = current;
  }

  return evidence;
}

async function resolveAllLinks(ocrText) {
  const urls = extractActionLinks(ocrText);

  if (urls.length === 0) {
    return { links: [], resolvedAt: null };
  }

  const batch = urls.slice(0, MAX_PARALLEL);

  const settled = await Promise.allSettled(
    batch.map((url) => resolveLink(url))
  );

  const links = settled
    .filter((s) => s.status === "fulfilled")
    .map((s) => s.value);

  return {
    links,
    resolvedAt: new Date().toISOString(),
  };
}

module.exports = {
  extractActionLinks,
  resolveLink,
  resolveAllLinks,
};

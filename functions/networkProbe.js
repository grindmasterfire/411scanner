/**
 * networkProbe — server-measured infrastructure facts about a scan target.
 *
 * The scan pipeline extracts links from the submitted image (linkResolver)
 * and asks Gemini to research the solicitation. This module independently
 * measures REAL network facts about the destination domain so the report's
 * Technical 411 is grounded in server observation, not model assertion:
 *
 *   - TLS certificate status  (valid / expired / self-signed / mismatch)
 *   - Hosting / CDN signals   (from response headers)
 *   - Domain age              (best-effort via RDAP, null when unavailable)
 *   - Final landing URL       (after redirects)
 *
 * Design rules:
 *   - Dependency-free (tls, https, dns/promises only).
 *   - NEVER throws: any failure yields { measured: false } and the scan
 *     continues on the "bypassed_no_target" path the workflow already
 *     handles.
 *   - Tight timeouts: this runs inside the scan hot path.
 *   - Defensive fetching: headers only (no body download), max 3
 *     redirects, private-range IPs are not probed.
 */

const tls = require("tls");
const https = require("https");
const dns = require("dns/promises");

const PER_CHECK_TIMEOUT_MS = 8000;
const RDAP_TIMEOUT_MS = 6000;
const MAX_REDIRECTS = 3;

const SCANNER_UA = "411Scanner/1.0 (network-probe)";

/* ------------------------------------------------------------------ */
/* target selection                                                    */
/* ------------------------------------------------------------------ */

function cleanDomain(raw) {
  if (!raw || typeof raw !== "string") return null;
  let d = raw.trim().toLowerCase();
  // tolerate a full URL being passed
  if (d.includes("://")) {
    try {
      d = new URL(d).hostname;
    } catch (e) {
      return null;
    }
  }
  d = d.split(":")[0].split("/")[0].trim();
  if (!d || /\s/.test(d) || !d.includes(".") || d.length > 253) return null;
  // basic label sanity
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d)) {
    return null;
  }
  return d;
}

function pickTarget(linkEvidence, candidateDomain) {
  const links =
    (linkEvidence && Array.isArray(linkEvidence.links) && linkEvidence.links) ||
    [];
  for (const link of links) {
    const d = cleanDomain((link && link.finalDomain) || "");
    if (d) return d;
    const fromUrl = cleanDomain((link && link.finalUrl) || "");
    if (fromUrl) return fromUrl;
  }
  return cleanDomain(candidateDomain);
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label || "check"} timed out after ${ms}ms`)),
      ms
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function isPrivateIp(ip) {
  // ipv4 private / loopback / link-local / reserved
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|127\.|169\.254\.|0\.)/.test(ip)) {
    return true;
  }
  // ipv6 loopback / link-local / unique-local
  const low = ip.toLowerCase();
  if (low === "::1" || low.startsWith("fe80:") || low.startsWith("fc") || low.startsWith("fd")) {
    return true;
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* TLS certificate check                                               */
/* ------------------------------------------------------------------ */

function checkTls(hostname) {
  return withTimeout(
    new Promise((resolve) => {
      let settled = false;
      const done = (result) => {
        if (!settled) {
          settled = true;
          resolve(result);
        }
      };
      let socket;
      try {
        socket = tls.connect(
          443,
          hostname,
          {
            servername: hostname,
            rejectUnauthorized: false, // we inspect the cert ourselves
          },
          () => {
            const cert = socket.getPeerCertificate(true);
            socket.destroy();
            if (!cert || !cert.subject) {
              done({ status: "no_tls" });
              return;
            }
            done(classifyCert(cert, hostname));
          }
        );
      } catch (e) {
        done({ status: "unreachable" });
        return;
      }
      socket.on("error", () => {
        if (socket) socket.destroy();
        done({ status: "unreachable" });
      });
      socket.setTimeout(PER_CHECK_TIMEOUT_MS, () => {
        if (socket) socket.destroy();
        done({ status: "unreachable" });
      });
    }),
    PER_CHECK_TIMEOUT_MS + 1000,
    "tls"
  ).catch(() => ({ status: "unreachable" }));
}

function certNames(cert) {
  const names = [];
  const san = cert.subjectaltname || "";
  san.split(",").forEach((part) => {
    const m = part.trim().match(/^DNS:(.+)$/i);
    if (m) names.push(m[1].toLowerCase());
  });
  if (cert.subject && cert.subject.CN) names.push(String(cert.subject.CN).toLowerCase());
  return names;
}

function hostnameMatchesCert(hostname, cert) {
  const names = certNames(cert);
  return names.some((pattern) => {
    if (pattern.startsWith("*.")) {
      const suffix = pattern.slice(2);
      return (
        hostname.endsWith("." + suffix) &&
        hostname.slice(0, -suffix.length - 1).indexOf(".") === -1
      );
    }
    return hostname === pattern;
  });
}

function classifyCert(cert, hostname) {
  const now = Date.now();
  const validTo = cert.valid_to ? Date.parse(cert.valid_to) : NaN;
  const validFrom = cert.valid_from ? Date.parse(cert.valid_from) : NaN;

  const issuerCN =
    (cert.issuer && (cert.issuer.CN || cert.issuer.O)) || "";
  const subjectCN =
    (cert.subject && (cert.subject.CN || cert.subject.O)) || "";
  const selfSigned =
    !!issuerCN && !!subjectCN &&
    String(issuerCN).toLowerCase() === String(subjectCN).toLowerCase();

  if (!Number.isNaN(validTo) && validTo < now) {
    return { status: "expired" };
  }
  if (!Number.isNaN(validFrom) && validFrom > now) {
    return { status: "not_yet_valid" };
  }
  if (selfSigned) {
    return { status: "self_signed" };
  }
  if (!hostnameMatchesCert(hostname.toLowerCase(), cert)) {
    return { status: "hostname_mismatch" };
  }
  return { status: "valid" };
}

/* ------------------------------------------------------------------ */
/* hosting / CDN signals (headers only, no body)                       */
/* ------------------------------------------------------------------ */

function detectCdn(headers) {
  const get = (name) => {
    const v = headers[name.toLowerCase()];
    return Array.isArray(v) ? v.join(" ") : String(v || "");
  };
  if (get("cf-ray") || /cloudflare/i.test(get("server"))) return "Cloudflare";
  if (get("x-amz-cf-id") || get("x-amz-cf-pop")) return "AWS CloudFront";
  if (/akamai/i.test(get("server")) || get("x-akamai-request-id")) return "Akamai";
  if (/^cache-[a-z0-9-]+$/i.test(get("x-served-by")) || get("x-cache-hits")) return "Fastly";
  if (/google/i.test(get("via")) || /gws/i.test(get("server")) || get("x-cloud-trace-context")) {
    return "Google";
  }
  if (/azure/i.test(get("server")) || get("x-ms-request-id")) return "Azure";
  if (/awselb/i.test(get("server"))) return "AWS ELB";
  const server = get("server");
  if (server && server !== "undefined" && server !== "") return `direct (${server})`;
  return "unknown";
}

function fetchHeadersOnly(url, redirectCount) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (result) => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };
    let req;
    try {
      req = https.get(
        url,
        { headers: { "User-Agent": SCANNER_UA }, timeout: PER_CHECK_TIMEOUT_MS },
        (res) => {
          const headers = {};
          for (const [k, v] of Object.entries(res.headers)) {
            headers[k.toLowerCase()] = v;
          }
          const status = res.statusCode || 0;
          // drain nothing: destroy immediately, we only wanted headers
          res.destroy();
          if (
            status >= 300 && status < 400 &&
            res.headers.location &&
            redirectCount < MAX_REDIRECTS
          ) {
            let next = res.headers.location;
            try {
              next = new URL(next, url).href;
            } catch (e) {
              done({ headers, finalUrl: url });
              return;
            }
            if (!next.startsWith("https://") && !next.startsWith("http://")) {
              done({ headers, finalUrl: url });
              return;
            }
            fetchHeadersOnly(next, redirectCount + 1).then(done);
            return;
          }
          done({ headers, finalUrl: url });
        }
      );
    } catch (e) {
      done(null);
      return;
    }
    req.on("error", () => done(null));
    req.on("timeout", () => {
      req.destroy();
      done(null);
    });
  });
}

async function checkHosting(hostname) {
  try {
    // defense in depth: don't probe private-range IPs (DNS rebinding)
    const addrs = await withTimeout(
      dns.lookup(hostname, { all: true }),
      PER_CHECK_TIMEOUT_MS,
      "dns"
    ).catch(() => null);
    if (addrs && addrs.length > 0 && addrs.every((a) => isPrivateIp(a.address))) {
      return null;
    }
    const result = await withTimeout(
      fetchHeadersOnly(`https://${hostname}/`, 0),
      PER_CHECK_TIMEOUT_MS + 2000,
      "https"
    ).catch(() => null);
    if (!result) return null;
    return {
      host_cdn: detectCdn(result.headers || {}),
      final_url: result.finalUrl || `https://${hostname}/`,
    };
  } catch (e) {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* domain age via RDAP (best-effort)                                    */
/* ------------------------------------------------------------------ */

const RDAP_BASE = {
  com: "https://rdap.verisign.com/com/v1/domain/",
  net: "https://rdap.verisign.com/net/v1/domain/",
  org: "https://rdap.publicinterestregistry.org/rdap/domain/",
  io: "https://rdap.nic.io/domain/",
  dev: "https://rdap.nic.google/domain/",
  app: "https://rdap.nic.google/domain/",
};

function fetchJson(url, timeoutMs) {
  return withTimeout(
    new Promise((resolve, reject) => {
      const req = https.get(
        url,
        { headers: { "User-Agent": SCANNER_UA, Accept: "application/json" } },
        (res) => {
          if (res.statusCode !== 200) {
            res.destroy();
            reject(new Error(`rdap http ${res.statusCode}`));
            return;
          }
          let body = "";
          res.on("data", (c) => {
            body += c;
            if (body.length > 200000) {
              res.destroy();
              reject(new Error("rdap body too large"));
            }
          });
          res.on("end", () => {
            try {
              resolve(JSON.parse(body));
            } catch (e) {
              reject(e);
            }
          });
        }
      );
      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("rdap timeout"));
      });
    }),
    timeoutMs,
    "rdap"
  ).catch(() => null);
}

async function checkDomainAge(domain) {
  try {
    const tld = domain.split(".").pop().toLowerCase();
    const base = RDAP_BASE[tld];
    if (!base) return null;
    const data = await fetchJson(
      base + encodeURIComponent(domain),
      RDAP_TIMEOUT_MS
    );
    if (!data || !Array.isArray(data.events)) return null;
    const reg = data.events.find(
      (e) => e.eventAction === "registration" && e.eventDate
    );
    if (!reg) return null;
    const created = Date.parse(reg.eventDate);
    if (Number.isNaN(created)) return null;
    const days = Math.floor((Date.now() - created) / 86400000);
    return days >= 0 ? days : null;
  } catch (e) {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Probe a target domain. Never throws — failures yield measured:false.
 */
async function runNetworkProbe(linkEvidence, candidateDomain) {
  const stamp = new Date().toISOString();
  try {
    const domain = pickTarget(linkEvidence, candidateDomain);
    if (!domain) {
      return { measured: false, measured_at: stamp };
    }
    const [tlsR, hostR, ageR] = await Promise.allSettled([
      checkTls(domain),
      checkHosting(domain),
      checkDomainAge(domain),
    ]);
    const tlsStatus =
      tlsR.status === "fulfilled" && tlsR.value ? tlsR.value.status : "unreachable";
    const hosting =
      hostR.status === "fulfilled" && hostR.value ? hostR.value : null;
    const ageDays =
      ageR.status === "fulfilled" && typeof ageR.value === "number"
        ? ageR.value
        : null;

    const measured = tlsStatus !== "unreachable" || hosting !== null;
    return {
      measured,
      measured_at: stamp,
      domain,
      tls_certificate_status: tlsStatus,
      host_cdn: hosting ? hosting.host_cdn : "unknown",
      domain_age_days: ageDays,
      final_url: hosting ? hosting.final_url : null,
    };
  } catch (e) {
    return { measured: false, measured_at: stamp };
  }
}

/**
 * Render measured facts as a Gemini prompt block. Empty when unmeasured.
 */
function probeContextBlock(probe) {
  if (!probe || !probe.measured) return "";
  const lines = [
    "",
    "SERVER-MEASURED NETWORK FACTS (authoritative — do not contradict these; " +
      "if your research disagrees, prefer these measurements):",
  ];
  if (probe.domain) lines.push(`- Domain: ${probe.domain}`);
  if (probe.tls_certificate_status) {
    lines.push(`- TLS certificate: ${probe.tls_certificate_status}`);
  }
  if (probe.host_cdn) lines.push(`- Hosting/CDN signal: ${probe.host_cdn}`);
  if (typeof probe.domain_age_days === "number") {
    lines.push(`- Domain age: ${probe.domain_age_days} days (via RDAP)`);
  }
  if (probe.final_url) lines.push(`- Final landing URL: ${probe.final_url}`);
  lines.push("");
  return lines.join("\n");
}

/**
 * Governance write: stamp server-measured facts into the report's
 * technical_ledger.network_telemetry. Never touches grounding_sources —
 * those belong to technicalLedgerEvidence.
 */
function applyMeasuredLedger(report, probe) {
  if (!report || !probe || !probe.measured) return report;
  const ledger = report.technical_ledger || (report.technical_ledger = {});
  const telemetry =
    ledger.network_telemetry || (ledger.network_telemetry = {});
  telemetry.app_package_or_domain = probe.domain || telemetry.app_package_or_domain || "";
  telemetry.host_cdn = probe.host_cdn || telemetry.host_cdn || "unknown";
  if (probe.tls_certificate_status) {
    telemetry.tls_certificate_status = probe.tls_certificate_status;
  }
  telemetry.domain_age_days =
    typeof probe.domain_age_days === "number" ? probe.domain_age_days : null;
  return report;
}

module.exports = {
  runNetworkProbe,
  probeContextBlock,
  applyMeasuredLedger,
  // test hooks
  _pickTarget: pickTarget,
  _classifyCert: classifyCert,
  _detectCdn: detectCdn,
  _checkTls: checkTls,
  _checkDomainAge: checkDomainAge,
};

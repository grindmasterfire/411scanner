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
 *   - Mail servers (MX)       (via DNS, best-effort)
 *   - DMARC / SPF (TXT)       (via DNS, best-effort)
 *   - Tracking IDs            (GA, GTM, Meta Pixel from page source)
 *   - ASN organization        (via Team Cymru DNS, best-effort)
 *   - Subdomains              (via crt.sh Certificate Transparency)
 *
 * Design rules:
 *   - Dependency-free (tls, https, dns/promises only).
 *   - NEVER throws: any failure yields { measured: false } and the scan
 *     continues on the "bypassed_no_target" path the workflow already
 *     handles.
 *   - Tight timeouts: this runs inside the scan hot path.
 *   - Defensive fetching: headers only (no body download), max 3
 *     redirects, private-range IPs are not probed.
 *   - Raw output: measurements are returned as observed. No model
 *     paraphrase. The Tech 411 reader gets forensic source data.
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
/* ------------------------------------------------------------------ */
/* mail servers (MX) via DNS — raw, as observed                        */
/* ------------------------------------------------------------------ */

async function checkMailServers(domain) {
  try {
    const records = await withTimeout(
      dns.resolveMx(domain),
      PER_CHECK_TIMEOUT_MS,
      "mx"
    ).catch(() => null);
    if (!records || records.length === 0) return null;
    // Sort by priority, return raw: [{priority, exchange}]
    return records
      .sort((a, b) => a.priority - b.priority)
      .map((r) => ({ priority: r.priority, exchange: r.exchange }));
  } catch (e) {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* DMARC / SPF via DNS TXT — raw, as observed                           */
/* ------------------------------------------------------------------ */

async function checkDmarcSpf(domain) {
  try {
    const [dmarcRecords, spfRecords] = await Promise.all([
      withTimeout(
        dns.resolveTxt(`_dmarc.${domain}`),
        PER_CHECK_TIMEOUT_MS,
        "dmarc"
      ).catch(() => null),
      withTimeout(
        dns.resolveTxt(domain),
        PER_CHECK_TIMEOUT_MS,
        "spf"
      ).catch(() => null),
    ]);
    const dmarc = dmarcRecords
      ? dmarcRecords.flat().find((t) => t.toLowerCase().startsWith("v=dmarc1"))
      : null;
    const spf = spfRecords
      ? spfRecords.flat().find((t) => t.toLowerCase().startsWith("v=spf1"))
      : null;
    if (!dmarc && !spf) return null;
    return {
      dmarc: dmarc || null,
      spf: spf || null,
    };
  } catch (e) {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* tracking IDs from page source — GA, GTM, Meta Pixel, TikTok          */
/* Raw IDs as found. No interpretation.                                  */
/* ------------------------------------------------------------------ */

const TRACKING_PATTERNS = [
  { name: "GA4", regex: /G-[A-Z0-9]{10}/g },
  { name: "UA", regex: /UA-\d{4,10}-\d{1,4}/g },
  { name: "GTM", regex: /GTM-[A-Z0-9]{6,8}/g },
  { name: "MetaPixel", regex: /fbq\(['"]init['"],\s*['"](\d{10,20})['"]/g },
  { name: "TikTokPixel", regex: /ttq\.load\(['"]([A-Z0-9]{20})['"]/g },
];

async function checkTrackingIds(hostname) {
  try {
    const html = await withTimeout(
      new Promise((resolve, reject) => {
        const req = https.get(
          `https://${hostname}/`,
          {
            headers: { "User-Agent": SCANNER_UA },
            timeout: PER_CHECK_TIMEOUT_MS,
          },
          (res) => {
            if (res.statusCode !== 200) {
              res.destroy();
              reject(new Error(`http ${res.statusCode}`));
              return;
            }
            let body = "";
            res.on("data", (c) => {
              body += c;
              // Cap at 500KB — we only need the head for tracking IDs
              if (body.length > 500000) {
                res.destroy();
                resolve(body);
              }
            });
            res.on("end", () => resolve(body));
          }
        );
        req.on("error", reject);
        req.on("timeout", () => {
          req.destroy();
          reject(new Error("timeout"));
        });
      }),
      PER_CHECK_TIMEOUT_MS + 2000,
      "pagesource"
    ).catch(() => null);
    if (!html) return null;
    const found = {};
    for (const { name, regex } of TRACKING_PATTERNS) {
      const matches = [...new Set(html.match(regex) || [])];
      if (matches.length > 0) {
        // For MetaPixel/TikTok, extract the capture group
        if (name === "MetaPixel" || name === "TikTokPixel") {
          const ids = [];
          let m;
          const re = new RegExp(regex.source, "g");
          while ((m = re.exec(html)) !== null) {
            if (m[1]) ids.push(m[1]);
          }
          if (ids.length > 0) found[name] = [...new Set(ids)];
        } else {
          found[name] = matches;
        }
      }
    }
    return Object.keys(found).length > 0 ? found : null;
  } catch (e) {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* ASN organization via Team Cymru DNS — raw, as observed               */
/* ------------------------------------------------------------------ */

async function checkAsnOrg(ipAddress) {
  try {
    if (!ipAddress || isPrivateIp(ipAddress)) return null;
    // IPv4 only for v1; IPv6 skipped
    if (ipAddress.includes(":")) return null;
    const reversed = ipAddress.split(".").reverse().join(".");
    const query = `${reversed}.origin.asn.cymru.com`;
    const records = await withTimeout(
      dns.resolveTxt(query),
      PER_CHECK_TIMEOUT_MS,
      "cymru"
    ).catch(() => null);
    if (!records || records.length === 0) return null;
    // Format: "13335 | 172.66.160.0/20 | US | arin | 2000-01-01"
    const raw = records.flat().join(" ");
    const parts = raw.split("|").map((p) => p.trim());
    if (parts.length < 3) return null;
    return {
      asn: parts[0],
      prefix: parts[1],
      country: parts[2],
      raw,
    };
  } catch (e) {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* subdomains via crt.sh Certificate Transparency — raw, as observed    */
/* ------------------------------------------------------------------ */

async function checkSubdomains(domain) {
  try {
    const data = await withTimeout(
      fetchJson(
        `https://crt.sh/?q=%25.${encodeURIComponent(domain)}&output=json`,
        PER_CHECK_TIMEOUT_MS + 2000
      ),
      PER_CHECK_TIMEOUT_MS + 3000,
      "crtsh"
    ).catch(() => null);
    if (!data || !Array.isArray(data) || data.length === 0) return null;
    const subs = [
      ...new Set(
        data
          .map((entry) => entry.name_value)
          .filter(Boolean)
          .flatMap((n) => n.split("\n"))
          .map((n) => n.trim().toLowerCase())
          .filter((n) => n.endsWith(domain.toLowerCase()) && n !== domain.toLowerCase())
      ),
    ].slice(0, 50); // Cap at 50
    return subs.length > 0 ? subs : null;
  } catch (e) {
    return null;
  }
}

async function runNetworkProbe(linkEvidence, candidateDomain) {
  const stamp = new Date().toISOString();
  try {
    const domain = pickTarget(linkEvidence, candidateDomain);
    if (!domain) {
      return { measured: false, measured_at: stamp };
    }
    const [tlsR, hostR, ageR, mxR, dmarcR, trackR, subR] = await Promise.allSettled([
      checkTls(domain),
      checkHosting(domain),
      checkDomainAge(domain),
      checkMailServers(domain),
      checkDmarcSpf(domain),
      checkTrackingIds(domain),
      checkSubdomains(domain),
    ]);
    const tlsStatus =
      tlsR.status === "fulfilled" && tlsR.value ? tlsR.value.status : "unreachable";
    const hosting =
      hostR.status === "fulfilled" && hostR.value ? hostR.value : null;
    const ageDays =
      ageR.status === "fulfilled" && typeof ageR.value === "number"
        ? ageR.value
        : null;
    const mx =
      mxR.status === "fulfilled" ? mxR.value : null;
    const dmarcSpf =
      dmarcR.status === "fulfilled" ? dmarcR.value : null;
    const tracking =
      trackR.status === "fulfilled" ? trackR.value : null;
    const subdomains =
      subR.status === "fulfilled" ? subR.value : null;

    // ASN org via Team Cymru — needs an IP, so resolve first
    let asnOrg = null;
    try {
      const addrs = await withTimeout(
        dns.lookup(domain, { all: true }),
        PER_CHECK_TIMEOUT_MS,
        "dns"
      ).catch(() => null);
      const ipv4 = addrs?.find((a) => a.family === 4)?.address;
      if (ipv4) {
        asnOrg = await checkAsnOrg(ipv4).catch(() => null);
      }
    } catch (e) {
      // best-effort only
    }

    const measured = tlsStatus !== "unreachable" || hosting !== null;
    return {
      measured,
      measured_at: stamp,
      domain,
      tls_certificate_status: tlsStatus,
      host_cdn: hosting ? hosting.host_cdn : "unknown",
      domain_age_days: ageDays,
      final_url: hosting ? hosting.final_url : null,
      // Raw forensic collectors — ZachXBT style, no fluff
      mail_servers: mx,
      dmarc_spf: dmarcSpf,
      tracking_ids: tracking,
      asn_org: asnOrg,
      subdomains: subdomains,
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
  // Raw forensic collectors — presented as observed, no interpretation
  if (probe.mail_servers) {
    lines.push(`- Mail servers (MX): ${JSON.stringify(probe.mail_servers)}`);
  }
  if (probe.dmarc_spf) {
    if (probe.dmarc_spf.dmarc) lines.push(`- DMARC: ${probe.dmarc_spf.dmarc}`);
    if (probe.dmarc_spf.spf) lines.push(`- SPF: ${probe.dmarc_spf.spf}`);
  }
  if (probe.tracking_ids) {
    lines.push(`- Tracking IDs: ${JSON.stringify(probe.tracking_ids)}`);
  }
  if (probe.asn_org) {
    lines.push(`- ASN: ${probe.asn_org.raw} (via Team Cymru)`);
  }
  if (probe.subdomains) {
    lines.push(`- Subdomains (CT): ${probe.subdomains.slice(0, 20).join(", ")}${probe.subdomains.length > 20 ? ` (+${probe.subdomains.length - 20} more)` : ""}`);
  }
  lines.push("");
  return lines.join("\n");
}

/**
 * Governance write: stamp server-measured facts into the report's
 * technical_ledger.network_telemetry and infrastructure.
 * Never touches grounding_sources — those belong to technicalLedgerEvidence.
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
  // Stamp raw forensic measurements into infrastructure for receipt generation
  const infra = ledger.infrastructure || (ledger.infrastructure = {});
  if (probe.mail_servers && !infra.mail_servers) {
    infra.mail_servers = probe.mail_servers;
  }
  if (probe.dmarc_spf && !infra.dmarc_spf) {
    infra.dmarc_spf = probe.dmarc_spf;
  }
  if (probe.tracking_ids && !infra.tracking_ids) {
    infra.tracking_ids = probe.tracking_ids;
  }
  if (probe.asn_org && !infra.asn_org) {
    infra.asn_org = probe.asn_org;
  }
  if (probe.subdomains && !infra.subdomains) {
    infra.subdomains = probe.subdomains;
  }
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

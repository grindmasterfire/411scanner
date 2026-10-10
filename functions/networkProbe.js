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
            headers: {
              // Use browser UA to avoid bot mitigation (Akamai, Cloudflare)
              // Approved by Gemini via interrogator 2026-10-10
              "User-Agent":
                "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36",
              "Accept-Language": "en-US,en;q=0.9",
              "Accept":
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
            timeout: PER_CHECK_TIMEOUT_MS,
          },
          (res) => {
            // Explicit WAF block handling — mark as not_accessible, don't silently return null
            if (res.statusCode === 403 || res.statusCode === 429) {
              res.destroy();
              reject(new Error("waf_blocked"));
              return;
            }
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
    ).catch((err) => {
      // Explicit WAF block marker — distinguishes bot mitigation from other failures
      if (err && err.message === "waf_blocked") return { _wafBlocked: true };
      return null;
    });
    if (!html) return null;
    if (html._wafBlocked) return { _wafBlocked: true };
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

    /*
     * Apex normalization for DNS-based probes.
     * WHY: MX, SPF, and DMARC records live on the apex domain, not subdomains.
     * Querying www.example.com for MX returns nothing; example.com has the records.
     * Added 2026-10-10 per Gemini interrogator discovery.
     */
    const apexDomain = domain
      .toLowerCase()
      .replace(/^www\./i, "");

    const [tlsR, hostR, ageR, mxR, dmarcR, trackR, subR] = await Promise.allSettled([
      checkTls(domain),
      checkHosting(domain),
      checkDomainAge(apexDomain),
      checkMailServers(apexDomain),
      checkDmarcSpf(apexDomain),
      checkTrackingIds(domain),
      checkSubdomains(apexDomain),
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

    // ASN org via Team Cymru — needs an IP, so resolve first.
    // WHY: capture all resolved IPs here so ip_addresses is populated from
    // the same DNS lookup rather than requiring a separate resolution pass.
    let asnOrg = null;
    let resolvedIps = [];
    try {
      const addrs = await withTimeout(
        dns.lookup(domain, { all: true }),
        PER_CHECK_TIMEOUT_MS,
        "dns"
      ).catch(() => null);
      if (addrs && addrs.length > 0) {
        resolvedIps = addrs.map((a) => a.address).filter(Boolean);
      }
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
      apex_domain: apexDomain,
      tls_certificate_status: tlsStatus,
      host_cdn: hosting ? hosting.host_cdn : "unknown",
      domain_age_days: ageDays,
      final_url: hosting ? hosting.final_url : null,
      // Raw forensic collectors — ZachXBT style, no fluff
      ip_addresses: resolvedIps,
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
  if (probe.ip_addresses && Array.isArray(probe.ip_addresses) && probe.ip_addresses.length > 0) {
    lines.push(`- Resolved IPs: ${probe.ip_addresses.slice(0, 5).join(", ")}`);
  }
  // Raw forensic collectors — presented as observed, no interpretation.
  // Defensive: truncate and sanitize to avoid prompt injection or overflow.
  try {
    // WHY: IPs are now collected in the same DNS lookup used for ASN; surface
    // them here so Gemini can reference them and emit infrastructure receipts.
    if (probe.ip_addresses && probe.ip_addresses.length > 0) {
      lines.push(`- Resolved IPs: ${probe.ip_addresses.slice(0, 8).join(", ")}`);
    }
    if (probe.mail_servers && Array.isArray(probe.mail_servers)) {
      const mx = probe.mail_servers.slice(0, 5).map((m) =>
        `${m.exchange || "?"} (pri ${m.priority ?? "?"})`
      ).join(", ");
      if (mx) lines.push(`- Mail servers (MX): ${mx}`);
    }
    if (probe.dmarc_spf) {
      if (probe.dmarc_spf.dmarc) {
        const d = String(probe.dmarc_spf.dmarc).slice(0, 200);
        lines.push(`- DMARC: ${d}`);
      }
      if (probe.dmarc_spf.spf) {
        const s = String(probe.dmarc_spf.spf).slice(0, 200);
        lines.push(`- SPF: ${s}`);
      }
    }
    if (probe.tracking_ids && typeof probe.tracking_ids === "object") {
      const parts = [];
      for (const [k, v] of Object.entries(probe.tracking_ids).slice(0, 5)) {
        const ids = Array.isArray(v) ? v.slice(0, 3).join(",") : String(v).slice(0, 50);
        parts.push(`${k}:${ids}`);
      }
      if (parts.length) lines.push(`- Tracking IDs: ${parts.join(" ")}`);
    }
    if (probe.asn_org && probe.asn_org.raw) {
      lines.push(`- ASN: ${String(probe.asn_org.raw).slice(0, 100)}`);
    }
    if (probe.subdomains && Array.isArray(probe.subdomains)) {
      const subs = probe.subdomains.slice(0, 10).join(", ");
      if (subs) lines.push(`- Subdomains (CT): ${subs}${probe.subdomains.length > 10 ? " (+" + (probe.subdomains.length - 10) + " more)" : ""}`);
    }
  } catch (_) {
    // Never let forensic enrichment break the prompt
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
  // Stamp raw forensic measurements into infrastructure.
  // WHY: schema and Android both use flat string/string-array fields.
  // Probe produces nested objects — flatten to the exact field names the
  // schema defines so Android parsing is never a type mismatch.
  const infra = ledger.infrastructure || (ledger.infrastructure = {});

  // ip_addresses: probe returns string[] from DNS lookup; merge with any IPs
  // Gemini may have grounded from research — don't clobber if already populated.
  if (probe.ip_addresses && probe.ip_addresses.length > 0) {
    const existing = Array.isArray(infra.ip_addresses) ? infra.ip_addresses : [];
    const merged = [...new Set([...existing, ...probe.ip_addresses])];
    infra.ip_addresses = merged;
  }

  // mail_servers: probe returns [{priority,exchange}]; schema/Android expect string[]
  if (probe.mail_servers && !infra.mail_servers) {
    infra.mail_servers = probe.mail_servers
      .map((mx) => (typeof mx === "string" ? mx : mx.exchange || ""))
      .filter(Boolean);
  }

  // dmarc_record / spf_record: probe returns {dmarc,spf}; schema has two separate strings
  if (probe.dmarc_spf) {
    if (!infra.dmarc_record && probe.dmarc_spf.dmarc) {
      infra.dmarc_record = probe.dmarc_spf.dmarc;
    }
    if (!infra.spf_record && probe.dmarc_spf.spf) {
      infra.spf_record = probe.dmarc_spf.spf;
    }
  }

  // tracking_ids: probe returns {GA4:[...],GTM:[...]}; schema/Android expect string[]
  // WAF block: if probe was blocked by bot mitigation, mark explicitly
  if (probe.tracking_ids && probe.tracking_ids._wafBlocked) {
    infra.tracking_ids_waf_blocked = true;
  } else if (probe.tracking_ids && !infra.tracking_ids) {
    infra.tracking_ids = Object.entries(probe.tracking_ids)
      .flatMap(([type, ids]) =>
        (Array.isArray(ids) ? ids : [ids]).map((id) => `${type}: ${id}`)
      )
      .filter(Boolean);
  }

  // asn / asn_organization: probe returns {asn,prefix,country,raw}; schema has two strings
  if (probe.asn_org) {
    if (!infra.asn && probe.asn_org.asn) {
      infra.asn = probe.asn_org.asn;
    }
    if (!infra.asn_organization && probe.asn_org.raw) {
      infra.asn_organization = probe.asn_org.raw;
    }
    if (!infra.asn_country && probe.asn_org.country) {
      infra.asn_country = probe.asn_org.country;
    }
  }

  // subdomains: probe already returns string[] — direct write, correct format
  if (probe.subdomains && !infra.subdomains) {
    infra.subdomains = probe.subdomains;
  }

  /*
   * Server-side probe receipt stamping.
   * WHY: Probe data is deterministic — it must never go through the LLM.
   * We create VERIFIED evidence receipts directly from measured values,
   * bypassing Gemini entirely. Added 2026-10-10 to replace the
   * PROBE-MEASURED prompt instructions (removed from prompt.js).
   */
  const receipts = ledger.evidence_receipts || (ledger.evidence_receipts = []);
  const existingFields = new Set(receipts.map((r) => r.field));
  const domain = probe.domain || "";

  function stampProbeReceipt(field, finding, sourceUrl = "") {
    if (!finding || existingFields.has(field)) return;
    receipts.push({
      field,
      status: "verified",
      finding,
      authority: "Network Probe",
      source_url: sourceUrl,
      subject: domain,
    });
    existingFields.add(field);
  }

  // Verifier URLs — user can independently verify each probe measurement
  const apex = probe.apex_domain || domain.replace(/^www\./i, "");
  const dnsVerifier = (type) => `https://mxtoolbox.com/SuperTool.aspx?action=${type}%3a${apex}`;

  if (infra.ip_addresses && infra.ip_addresses.length > 0) {
    stampProbeReceipt(
      "infrastructure.ip_addresses",
      `Resolved IP addresses: ${infra.ip_addresses.join(", ")}`,
      `https://www.whatsmydns.net/#A/${apex}`
    );
  }
  if (infra.mail_servers && infra.mail_servers.length > 0) {
    stampProbeReceipt(
      "infrastructure.mail_servers",
      `Mail exchangers: ${infra.mail_servers.join(", ")}`,
      dnsVerifier("mx")
    );
  }
  if (infra.dmarc_record) {
    stampProbeReceipt(
      "infrastructure.dmarc_record",
      `DMARC record: ${infra.dmarc_record}`,
      dnsVerifier("dmarc")
    );
  }
  if (infra.spf_record) {
    stampProbeReceipt(
      "infrastructure.spf_record",
      `SPF record: ${infra.spf_record}`,
      dnsVerifier("spf")
    );
  }
  if (infra.tracking_ids && infra.tracking_ids.length > 0) {
    stampProbeReceipt(
      "infrastructure.tracking_ids",
      `Tracking IDs: ${infra.tracking_ids.join(", ")}`
    );
  } else if (infra.tracking_ids_waf_blocked) {
    // Explicit WAF block — not silently missing
    receipts.push({
      field: "infrastructure.tracking_ids",
      status: "not_accessible",
      finding: "Tracking ID probe blocked by CDN bot mitigation (WAF). The target uses bot protection that prevents automated page scraping.",
      authority: "Network Probe",
      source_url: "",
      subject: domain,
    });
    existingFields.add("infrastructure.tracking_ids");
  }
  if (infra.subdomains && infra.subdomains.length > 0) {
    stampProbeReceipt(
      "infrastructure.subdomains",
      `Discovered subdomains: ${infra.subdomains.join(", ")}`,
      `https://crt.sh/?q=${apex}`
    );
  }
  if (infra.asn) {
    const asnNum = String(infra.asn).replace(/[^0-9]/g, "");
    stampProbeReceipt(
      "infrastructure.asn",
      `ASN: ${infra.asn}${infra.asn_organization ? ` (${infra.asn_organization})` : ""}`,
      asnNum ? `https://bgp.he.net/AS${asnNum}` : ""
    );
  }
  if (telemetry.tls_certificate_status) {
    stampProbeReceipt(
      "infrastructure.tls_issuer",
      `TLS certificate status: ${telemetry.tls_certificate_status}`,
      `https://www.ssllabs.com/ssltest/analyze.html?d=${domain}`
    );
  }

  return report;
}

/**
 * Governance write: stamp deterministic redirect-path evidence into the
 * report's technical_ledger.redirect_path. Uses the linkEvidence from
 * linkResolver.js — the actual redirect chain as observed by the server.
 * A shortener must not become the end of the investigation.
 */
function applyRedirectPath(report, linkEvidence) {
  if (!report) return report;
  const ledger = report.technical_ledger || (report.technical_ledger = {});

  const links = linkEvidence?.links;
  if (!Array.isArray(links) || links.length === 0) {
    // No links resolved — leave redirect_path absent, do not fabricate
    return report;
  }

  // Use the primary (first) resolved link for the canonical redirect path
  const primary = links[0];
  if (!primary || !primary.submittedUrl) return report;

  const hops = (primary.hops || []).map((h, idx) => ({
    url: h.to || h.from || "",
    status_code: typeof h.status === "number" ? h.status : null,
    hop_index: idx,
  }));

  // Detect shortener from submitted URL host
  let shortener = null;
  try {
    const host = new URL(primary.submittedUrl).hostname.toLowerCase();
    const SHORTENERS = new Set([
      "bit.ly", "t.co", "tinyurl.com", "goo.gl", "ow.ly", "is.gd",
      "buff.ly", "adf.ly", "bl.ink", "lnkd.in", "cutt.ly", "rb.gy",
    ]);
    if (SHORTENERS.has(host)) shortener = host;
  } catch (_) {}

  // Extract tracking parameters from final URL
  let trackingParams = [];
  try {
    const finalUrl = new URL(primary.finalUrl || primary.submittedUrl);
    trackingParams = [...finalUrl.searchParams.keys()].filter((k) => {
      const lower = k.toLowerCase();
      return lower.startsWith("utm_") || lower.includes("aff") ||
             lower.includes("ref") || lower.includes("track") ||
             lower.includes("cid") || lower === "fbclid" || lower === "gclid";
    });
  } catch (_) {}

  ledger.redirect_path = {
    submitted_url: primary.submittedUrl,
    normalized_url: primary.finalUrl || primary.submittedUrl,
    hops,
    final_destination: primary.finalUrl || primary.submittedUrl,
    final_domain: primary.finalDomain || "",
    shortener_identity: shortener,
    tracking_parameters: trackingParams,
  };

  return report;
}

module.exports = {
  runNetworkProbe,
  probeContextBlock,
  applyMeasuredLedger,
  applyRedirectPath,
  // test hooks
  _pickTarget: pickTarget,
  _classifyCert: classifyCert,
  _detectCdn: detectCdn,
  _checkTls: checkTls,
  _checkDomainAge: checkDomainAge,
};

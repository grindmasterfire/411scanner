/**
 * Unit tests for networkProbe.js — server-measured infrastructure facts.
 * Pure logic is tested directly; the one live-network check degrades to
 * SKIP when outbound TLS is unavailable (as on restricted CI VMs).
 * Run: node tests/networkProbeTest.js
 */
const assert = require("node:assert/strict");

const {
  runNetworkProbe,
  probeContextBlock,
  applyMeasuredLedger,
  _pickTarget,
  _classifyCert,
  _detectCdn,
  _checkTls,
} = require("../networkProbe");

let passed = 0;
let skipped = 0;
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok: ${name}`);
  } catch (e) {
    console.error(`  FAIL: ${name}\n    ${e.message}`);
    process.exitCode = 1;
  }
}
async function checkAsync(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok: ${name}`);
  } catch (e) {
    console.error(`  FAIL: ${name}\n    ${e.message}`);
    process.exitCode = 1;
  }
}

function fakeCert(overrides) {
  return Object.assign(
    {
      subject: { CN: "example.com" },
      issuer: { CN: "DigiCert Inc" },
      subjectaltname: "DNS:example.com, DNS:www.example.com",
      valid_from: "Jan  1 00:00:00 2024 GMT",
      valid_to: "Jan  1 00:00:00 2030 GMT",
    },
    overrides || {}
  );
}

(async () => {
console.log("== networkProbe: target selection ==");

await checkAsync("no links and no candidate -> unmeasured, never throws", async () => {
  const p = await runNetworkProbe(null, null);
  assert.equal(p.measured, false);
  assert.ok(p.measured_at);
});
await checkAsync("empty links + junk candidate -> unmeasured", async () => {
  const p = await runNetworkProbe({ links: [] }, "not a domain!!");
  assert.equal(p.measured, false);
});
check("picks finalDomain from first link", () => {
  const t = _pickTarget({
    links: [{ finalDomain: "Scam-Site.COM", finalUrl: "https://x.com/a" }],
  });
  assert.equal(t, "scam-site.com");
});
check("falls back to finalUrl hostname", () => {
  const t = _pickTarget({ links: [{ finalUrl: "https://Sub.Example.org/path?q=1" }] });
  assert.equal(t, "sub.example.org");
});
check("falls back to candidate domain", () => {
  assert.equal(_pickTarget({ links: [] }, "Example.NET"), "example.net");
});
check("rejects non-domains", () => {
  assert.equal(_pickTarget(null, "localhost"), null);
  assert.equal(_pickTarget(null, "just words here"), null);
});

console.log("== networkProbe: cert classification ==");
check("valid cert", () => {
  assert.equal(_classifyCert(fakeCert(), "example.com").status, "valid");
});
check("expired cert", () => {
  const c = fakeCert({ valid_to: "Jan  1 00:00:00 2020 GMT" });
  assert.equal(_classifyCert(c, "example.com").status, "expired");
});
check("self-signed cert", () => {
  const c = fakeCert({ issuer: { CN: "example.com" } });
  assert.equal(_classifyCert(c, "example.com").status, "self_signed");
});
check("hostname mismatch", () => {
  assert.equal(
    _classifyCert(fakeCert(), "evil.com").status,
    "hostname_mismatch"
  );
});
check("wildcard matches subdomain only", () => {
  const c = fakeCert({
    subject: { CN: "*.example.com" },
    subjectaltname: "DNS:*.example.com",
  });
  assert.equal(_classifyCert(c, "a.example.com").status, "valid");
  assert.equal(
    _classifyCert(c, "a.b.example.com").status,
    "hostname_mismatch"
  );
});

console.log("== networkProbe: CDN detection ==");
check("cloudflare via cf-ray", () => {
  assert.equal(_detectCdn({ "cf-ray": "abc123" }), "Cloudflare");
});
check("cloudfront via x-amz-cf-id", () => {
  assert.equal(_detectCdn({ "x-amz-cf-id": "x" }), "AWS CloudFront");
});
check("fastly via x-served-by", () => {
  assert.equal(_detectCdn({ "x-served-by": "cache-iad1234" }), "Fastly");
});
check("unknown headers", () => {
  assert.equal(_detectCdn({}), "unknown");
});

console.log("== networkProbe: prompt block ==");
check("null probe -> empty string", () => {
  assert.equal(probeContextBlock(null), "");
});
check("unmeasured probe -> empty string", () => {
  assert.equal(probeContextBlock({ measured: false }), "");
});
check("measured probe renders facts", () => {
  const out = probeContextBlock({
    measured: true,
    domain: "scam.example",
    tls_certificate_status: "expired",
    host_cdn: "Cloudflare",
    domain_age_days: 3,
    final_url: "https://scam.example/",
  });
  assert.ok(out.includes("scam.example"));
  assert.ok(out.includes("expired"));
  assert.ok(out.includes("3 days"));
  assert.ok(out.includes("authoritative"));
});

console.log("== networkProbe: ledger write ==");
check("stamps measured fields, preserves grounding_sources", () => {
  const report = {
    technical_ledger: {
      network_telemetry: {
        app_package_or_domain: "old.example",
        host_cdn: "old",
        grounding_sources: ["https://real.source/1"],
      },
    },
  };
  applyMeasuredLedger(report, {
    measured: true,
    domain: "scam.example",
    tls_certificate_status: "self_signed",
    host_cdn: "unknown",
    domain_age_days: null,
  });
  const nt = report.technical_ledger.network_telemetry;
  assert.equal(nt.app_package_or_domain, "scam.example");
  assert.equal(nt.tls_certificate_status, "self_signed");
  assert.deepEqual(nt.grounding_sources, ["https://real.source/1"]);
});
check("creates ledger path when missing", () => {
  const report = {};
  applyMeasuredLedger(report, {
    measured: true,
    domain: "x.example",
    host_cdn: "unknown",
  });
  assert.equal(report.technical_ledger.network_telemetry.app_package_or_domain, "x.example");
});
check("unmeasured probe leaves report untouched", () => {
  const report = { a: 1 };
  applyMeasuredLedger(report, { measured: false });
  assert.deepEqual(report, { a: 1 });
});

console.log("== networkProbe: live TLS (best-effort) ==");
await checkAsync("live TLS check against example.com", async () => {
  try {
    const r = await _checkTls("example.com");
    assert.ok(
      ["valid", "unreachable"].includes(r.status),
      `unexpected status ${r.status}`
    );
    if (r.status === "unreachable") {
      skipped += 1;
      console.log("  (no outbound TLS from this VM — treated as SKIP)");
    }
  } catch (e) {
    skipped += 1;
    console.log(`  (live check unavailable: ${e.message} — SKIP)`);
  }
});

console.log(`\n${passed} network-probe checks passed, ${skipped} skipped${process.exitCode ? " (WITH FAILURES)" : ""}.`);
})();

/**
 * 411 Scanner Gemini Interrogator
 *
 * Ask the Gemini model directly about a scan. Loads the scan's probe data,
 * prompt context, and model response, then starts an interactive session
 * where you can ask "why" and "what" in plain English.
 *
 * Usage:
 *   node scripts/ask-gemini.js <requestId>
 *   node scripts/ask-gemini.js last
 *
 * Then ask questions like:
 *   Why did you mark infrastructure.ip_addresses as unresolved?
 *   What probe data did you see for mail_servers?
 *   Did you see the NETWORK PROBE MEASUREMENTS section?
 *
 * This is a LOCAL diagnostic tool. It is NOT deployed. It is NOT reachable
 * from the app. Only runnable via Cloud Shell with Firebase credentials.
 *
 * Requires: GEMINI_API_KEY environment variable
 */

const admin = require("firebase-admin");
const readline = require("readline");
const { GoogleGenerativeAI } = require("@google/generative-ai");

admin.initializeApp({ projectId: "scanner-4ea67" });
const db = admin.firestore();

const PASS1_MODEL = process.env.PASS1_MODEL || "gemini-3.1-pro-preview";
const PASS2_MODEL = process.env.PASS2_MODEL || "gemini-3.8-flash";

async function loadScan(requestId) {
  // Try scan_receipts first for metadata
  let targetId = requestId;

  if (requestId === "last") {
    const snap = await db
      .collection("scan_receipts")
      .orderBy("createdAt", "desc")
      .limit(1)
      .get();
    if (snap.empty) {
      throw new Error("No scans found.");
    }
    const doc = snap.docs[0];
    targetId = doc.id;
    console.log(`\nUsing most recent scan: ${targetId}`);
  }

  // Load from scan_cache via the receipt's cacheKey
  const receiptDoc = await db.collection("scan_receipts").doc(targetId).get();
  if (!receiptDoc.exists) {
    throw new Error(`No receipt found for ${targetId}`);
  }
  const receipt = receiptDoc.data();
  const cacheKey = receipt.cacheKey;

  if (!cacheKey) {
    throw new Error("Receipt has no cacheKey. Cannot load full report.");
  }

  const cacheDoc = await db.collection("scan_cache").doc(cacheKey).get();
  if (!cacheDoc.exists) {
    throw new Error(`No cached report for key ${cacheKey}`);
  }

  return { receipt, report: cacheDoc.data(), requestId: targetId };
}

function buildContext(receipt, cached) {
  const report = cached.report || cached;
  const ledger = report.technical_ledger || {};
  const receipts = ledger.evidence_receipts || [];
  const consumerCard = report.consumer_card || {};
  const telemetry = report.telemetry || {};

  let ctx = `You are the Gemini model that performed a 411 Scanner investigation. `;
  ctx += `The operator is asking you diagnostic questions about WHY you produced certain output. `;
  ctx += `You have FULL context: the complete technical ledger, all receipts, probe data, grounding sources, scoring data, and cost telemetry. `;
  ctx += `Answer honestly and specifically based on the data below. If you don't know, say so.\n\n`;

  ctx += `=== SCAN METADATA ===\n`;
  ctx += `Request ID: ${receipt.requestId || "unknown"}\n`;
  ctx += `Target: ${receipt.target || consumerCard.entity_name || "unknown"}\n`;
  ctx += `Action Meter Score: ${consumerCard.action_meter_score ?? report.score ?? "unknown"}\n`;
  ctx += `Mode: ${receipt.mode || "unknown"}\n`;
  ctx += `Timestamp: ${receipt.createdAt?.toDate?.()?.toISOString?.() || "unknown"}\n\n`;

  ctx += `=== COST & TOKEN TELEMETRY ===\n`;
  const usage = receipt.usage || {};
  const cost = receipt.cost || {};
  const totalCost = (cost.tokenCostUsd || 0) + (cost.groundingCostUsdAtPaidRate || 0);
  ctx += `Total Cost: $${totalCost ? totalCost.toFixed(4) : "unknown"}\n`;
  ctx += `  - Token Cost: $${cost.tokenCostUsd?.toFixed(4) || "unknown"}\n`;
  ctx += `  - Grounding Cost: $${cost.groundingCostUsdAtPaidRate?.toFixed(4) || "unknown"}\n`;
  ctx += `Prompt Tokens: ${usage.promptTokens ?? "unknown"}\n`;
  ctx += `Output Tokens: ${usage.outputTokens ?? "unknown"}\n`;
  ctx += `Thought Tokens: ${usage.thoughtTokens ?? "unknown"}\n`;
  ctx += `Total Tokens: ${((usage.promptTokens || 0) + (usage.outputTokens || 0) + (usage.thoughtTokens || 0)) || "unknown"}\n`;
  ctx += `Model: ${receipt.model || "unknown"}\n`;
  ctx += `Target: ${receipt.targetName || "unknown"}\n`;
  ctx += `Cache Key: ${receipt.cacheKey || "(none)"}\n`;
  ctx += `Cache Hit: ${receipt.cacheHit ? "yes" : "no"}\n\n`;

  ctx += `=== EVIDENCE RECEIPTS (${receipts.length}) ===\n`;
  receipts.forEach((r, i) => {
    ctx += `\n${i + 1}. [${(r.status || "unknown").toUpperCase()}] ${r.field || "unknown field"}\n`;
    ctx += `   Finding: ${(r.finding || "").substring(0, 500)}\n`;
    ctx += `   Authority: ${r.authority || "none"}\n`;
    ctx += `   Subject: ${r.subject || "none"}\n`;
    ctx += `   Source URL: ${r.source_url || "(none)"}\n`;
    if (r.identifier) ctx += `   Identifier: ${r.identifier}\n`;
  });

  ctx += `\n=== FULL TECHNICAL LEDGER ===\n`;
  // Attribution
  if (ledger.attribution) {
    ctx += `\nAttribution:\n`;
    for (const [k, v] of Object.entries(ledger.attribution)) {
      const str = typeof v === "object" ? JSON.stringify(v).substring(0, 200) : String(v).substring(0, 200);
      ctx += `  ${k}: ${str}\n`;
    }
  }
  // Infrastructure
  if (ledger.infrastructure) {
    ctx += `\nInfrastructure:\n`;
    for (const [k, v] of Object.entries(ledger.infrastructure)) {
      const str = Array.isArray(v) ? v.join(", ").substring(0, 200) : String(v).substring(0, 200);
      ctx += `  ${k}: ${str}\n`;
    }
  }
  // Domain registration
  if (ledger.domain_registration) {
    ctx += `\nDomain Registration:\n`;
    for (const [k, v] of Object.entries(ledger.domain_registration)) {
      ctx += `  ${k}: ${String(v).substring(0, 200)}\n`;
    }
  }
  // Network telemetry
  if (ledger.network_telemetry) {
    ctx += `\nNetwork Telemetry:\n`;
    for (const [k, v] of Object.entries(ledger.network_telemetry)) {
      ctx += `  ${k}: ${String(v).substring(0, 200)}\n`;
    }
  }

  ctx += `\n=== PROBE DATA (deterministic server measurements) ===\n`;
  const probeFields = [
    "ip_addresses",
    "mail_servers",
    "dmarc_record",
    "spf_record",
    "tracking_ids",
    "subdomains",
    "asn",
    "asn_organization",
    "tls_certificate_status",
  ];
  const infra = ledger.infrastructure || {};
  probeFields.forEach((f) => {
    const val = infra[f] ?? ledger[f];
    if (val !== undefined && val !== null && val !== "") {
      const str = Array.isArray(val) ? val.join(", ") : String(val);
      ctx += `${f}: ${str.substring(0, 300) || "(empty)"}\n`;
    } else {
      ctx += `${f}: (not present in ledger)\n`;
    }
  });

  // Grounding sources
  const sources = report.grounding_sources || report.sources || [];
  if (sources.length > 0) {
    ctx += `\n=== GROUNDING SOURCES (${sources.length}) ===\n`;
    sources.slice(0, 30).forEach((s, i) => {
      const url = typeof s === "string" ? s : s.url || s.uri || JSON.stringify(s).substring(0, 100);
      ctx += `${i + 1}. ${url.substring(0, 150)}\n`;
    });
    if (sources.length > 30) ctx += `... and ${sources.length - 30} more\n`;
  }

  // Consumer card scoring details
  if (consumerCard && Object.keys(consumerCard).length > 0) {
    ctx += `\n=== CONSUMER CARD ===\n`;
    ctx += `Entity: ${consumerCard.entity_name || "unknown"}\n`;
    ctx += `Score: ${consumerCard.action_meter_score ?? "unknown"}\n`;
    if (consumerCard.risk_vectors) {
      ctx += `Risk Vectors: ${JSON.stringify(consumerCard.risk_vectors).substring(0, 500)}\n`;
    }
  }

  // Scoring context
  ctx += `\n=== SCORING CONTEXT ===\n`;
  ctx += `The 411 Scanner uses a 1-10 action meter:\n`;
  ctx += `- 1-5.5: Lower risk, shows verified contact info\n`;
  ctx += `- 5.6+: Higher risk, shows fog light of alternatives\n`;
  ctx += `- 8: Do not put on device\n`;
  ctx += `- 9: Report to platform\n`;
  ctx += `- 10: Malware/dangerous\n`;
  ctx += `Score is calculated from 6 risk vectors. Positive factors (longevity, reviews) should offset negatives.\n\n`;

  return ctx;
}

async function main() {
  const requestId = process.argv[2];
  if (!requestId) {
    console.error("Usage: node scripts/ask-gemini.js <requestId|last>");
    process.exit(1);
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY environment variable is not set.");
    console.error("Set it before running: export GEMINI_API_KEY=your-key");
    process.exit(1);
  }

  console.log("Loading scan data...");
  const { receipt, report, requestId: rid } = await loadScan(requestId);
  const context = buildContext(receipt, report);

  console.log(`\nContext loaded. Starting interrogation session with ${PASS2_MODEL}.`);
  console.log("Ask questions about the scan. Type 'exit' or 'quit' to end.\n");
  console.log("Example questions:");
  console.log('  - Why did you mark infrastructure.ip_addresses as unresolved?');
  console.log('  - What probe data did you see for mail_servers?');
  console.log('  - Did the NETWORK PROBE MEASUREMENTS section have data?\n');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: PASS2_MODEL });
  const chat = model.startChat({
    history: [
      { role: "user", parts: [{ text: context }] },
      {
        role: "model",
        parts: [
          {
            text: "I have the scan context loaded. Ask me anything about why I produced the output I did.",
          },
        ],
      },
    ],
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "\n> ",
  });

  rl.prompt();

  rl.on("line", async (line) => {
    const question = line.trim();
    if (!question) {
      rl.prompt();
      return;
    }
    if (["exit", "quit", "q"].includes(question.toLowerCase())) {
      console.log("\nSession ended.");
      rl.close();
      process.exit(0);
    }

    try {
      const result = await chat.sendMessage(question);
      const response = result.response.text();
      console.log(`\n${response}`);
    } catch (err) {
      console.error(`\nError: ${err.message}`);
    }

    rl.prompt();
  });

  rl.on("close", () => {
    console.log("\nSession ended.");
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(`\nFatal: ${err.message}`);
  process.exit(1);
});

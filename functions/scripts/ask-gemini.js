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

  let ctx = `You are the Gemini model that performed a 411 Scanner investigation. `;
  ctx += `The operator is asking you diagnostic questions about WHY you produced certain output. `;
  ctx += `Answer honestly and specifically based on the data below. If you don't know, say so.\n\n`;

  ctx += `=== SCAN METADATA ===\n`;
  ctx += `Request ID: ${receipt.requestId || "unknown"}\n`;
  ctx += `Target: ${receipt.target || "unknown"}\n`;
  ctx += `Score: ${report.score ?? "unknown"}\n\n`;

  ctx += `=== EVIDENCE RECEIPTS YOU PRODUCED (${receipts.length}) ===\n`;
  receipts.forEach((r, i) => {
    ctx += `\n${i + 1}. [${(r.status || "unknown").toUpperCase()}] ${r.field || "unknown field"}\n`;
    ctx += `   Finding: ${(r.finding || "").substring(0, 300)}\n`;
    ctx += `   Authority: ${r.authority || "none"}\n`;
    ctx += `   Source URL: ${r.source_url || "(none)"}\n`;
  });

  ctx += `\n=== PROBE DATA (deterministic server measurements) ===\n`;
  const probeFields = [
    "ip_addresses",
    "mail_servers",
    "dmarc_record",
    "spf_record",
    "tracking_ids",
    "subdomains",
    "asn",
  ];
  probeFields.forEach((f) => {
    const val = ledger[f];
    if (val !== undefined && val !== null) {
      const str = Array.isArray(val) ? val.join(", ") : String(val);
      ctx += `${f}: ${str.substring(0, 200) || "(empty)"}\n`;
    } else {
      ctx += `${f}: (not present in ledger)\n`;
    }
  });

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

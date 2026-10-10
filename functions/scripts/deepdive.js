/**
 * 411 Scanner Deep Dive CLI
 *
 * List, inspect, and interrogate Deep Dive reports.
 *
 * Usage:
 *   node scripts/deepdive.js list              - List recent deep dives
 *   node scripts/deepdive.js <deepDiveId>       - Show a deep dive report
 *   node scripts/deepdive.js ask <deepDiveId>   - Interrogate via Gemini
 */

const admin = require("firebase-admin");
const readline = require("readline");
const { GoogleGenerativeAI } = require("@google/generative-ai");

admin.initializeApp({ projectId: "scanner-4ea67" });
const db = admin.firestore();

async function listDeepDives() {
  const snap = await db
    .collection("deep_dive_receipts")
    .orderBy("createdAt", "desc")
    .limit(10)
    .get();
  if (snap.empty) {
    console.log("No deep dives found.");
    return;
  }
  console.log("\nRecent Deep Dives:");
  snap.docs.forEach((doc, i) => {
    const d = doc.data();
    const target = d.targetName || "?";
    const ts = d.createdAt?.toDate?.()?.toISOString?.()?.substring(0, 16) || "?";
    console.log(`  ${i + 1}. ${doc.id} | ${target} | ${ts}`);
  });
}

async function showDeepDive(deepDiveId) {
  const doc = await db.collection("deep_dive_receipts").doc(deepDiveId).get();
  if (!doc.exists) {
    console.error(`No deep dive found for ${deepDiveId}`);
    process.exit(1);
  }
  const d = doc.data();
  console.log(`\n=== Deep Dive: ${deepDiveId} ===`);
  console.log(`Target: ${d.targetName || "?"}`);
  console.log(`Finding: ${d.focusFinding || "?"}`);
  console.log(`Cost: $${d.cost?.total ?? "?"}`);
  console.log(`\n--- Report ---\n`);
  console.log(d.report || d.narrative || JSON.stringify(d, null, 2).substring(0, 2000));
}

async function askDeepDive(deepDiveId) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY not set.");
    process.exit(1);
  }

  const doc = await db.collection("deep_dive_receipts").doc(deepDiveId).get();
  if (!doc.exists) {
    console.error(`No deep dive found for ${deepDiveId}`);
    process.exit(1);
  }
  const d = doc.data();

  let ctx = `You are a 411 Scanner Deep Dive analyst. The operator is asking about this Deep Dive report.\n\n`;
  ctx += `Target: ${d.targetName || "unknown"}\n`;
  ctx += `Focus Finding: ${d.focusFinding || "unknown"}\n`;
  ctx += `Cost: $${d.cost?.total ?? "unknown"}\n\n`;
  ctx += `=== REPORT ===\n${d.report || d.narrative || "(no report text)"}\n`;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-3.8-flash" });
  const chat = model.startChat({
    history: [
      { role: "user", parts: [{ text: ctx }] },
      { role: "model", parts: [{ text: "Deep Dive loaded. Ask me anything." }] },
    ],
  });

  console.log("\nDeep Dive loaded. Ask questions. Type 'exit' to end.\n");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "\n> " });
  rl.prompt();
  rl.on("line", async (line) => {
    const q = line.trim();
    if (!q) { rl.prompt(); return; }
    if (["exit", "quit", "q"].includes(q.toLowerCase())) { rl.close(); process.exit(0); }
    try {
      const result = await chat.sendMessage(q);
      console.log(`\n${result.response.text()}`);
    } catch (err) {
      console.error(`\nError: ${err.message}`);
    }
    rl.prompt();
  });
}

async function main() {
  const cmd = process.argv[2];
  if (!cmd) {
    console.error("Usage: node scripts/deepdive.js <list|<deepDiveId>|ask <deepDiveId>>");
    process.exit(1);
  }
  if (cmd === "list") await listDeepDives();
  else if (cmd === "ask") await askDeepDive(process.argv[3]);
  else await showDeepDive(cmd);
  process.exit(0);
}

main().catch((err) => {
  console.error(`\nFatal: ${err.message}`);
  process.exit(1);
});

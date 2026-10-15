#!/usr/bin/env node
/**
 * Incident Ledger console: interrogate Gemini about a stored incident, or
 * query incidents across scans. Runs anywhere `gcloud` is signed in as the
 * project owner (Codespace or Cloud Shell); no service-account keys.
 *
 *   node scripts/incident.js ask <requestId> "<question>"
 *   node scripts/incident.js show <requestId>
 *   node scripts/incident.js list [--tag attack|scam|legit|inconclusive|deep_dive] [--days 7] [--min-score 8]
 *
 * "ask" loads the complete incident from the ledger: the original specimen
 * image (sent to Gemini as the image itself), the OCR text, every prompt
 * and raw response, grounding, and the final report. Each question and
 * answer is appended to incidents/<requestId>/notes, and earlier notes are
 * replayed, so an interrogation continues across sessions.
 */

const { execSync } = require("child_process");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const PROJECT = "scanner-4ea67";
const FIRESTORE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const MODEL = "gemini-3.8-flash";

const token = () => execSync("gcloud auth print-access-token", { encoding: "utf8" }).trim();

async function api(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json", ...(options.headers || {}) },
  });
  if (!res.ok) throw new Error(`${res.status} ${url.split("?")[0]}: ${(await res.text()).slice(0, 200)}`);
  return res;
}

function unwrap(v) {
  if (!v || typeof v !== "object") return v;
  if ("mapValue" in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, unwrap(x)]));
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(unwrap);
  if ("integerValue" in v) return Number(v.integerValue);
  if ("nullValue" in v) return null;
  return Object.values(v)[0];
}
const docFields = (d) => Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, unwrap(v)]));

async function getIncident(id) {
  return docFields(await (await api(`${FIRESTORE}/incidents/${encodeURIComponent(id)}`)).json());
}

async function gcs(uri, binary = false) {
  const [, bucket, ...path] = uri.replace("gs://", "/").split("/");
  const res = await api(`https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(path.join("/"))}?alt=media`);
  return binary ? Buffer.from(await res.arrayBuffer()) : res.text();
}

// Earlier interrogation of this incident, oldest first (runQuery on the
// incident document scopes it to its own notes subcollection).
async function notesOf(id) {
  const r = await api(`${FIRESTORE}/incidents/${encodeURIComponent(id)}:runQuery`, {
    method: "POST",
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: "notes" }], orderBy: [{ field: { fieldPath: "atMs" } }] } }),
  });
  return (await r.json()).filter((x) => x.document).map((x) => docFields(x.document));
}

async function addNote(id, note) {
  const fields = Object.fromEntries(Object.entries(note).map(([k, v]) => [k, typeof v === "number" ? { integerValue: String(v) } : { stringValue: String(v) }]));
  await api(`${FIRESTORE}/incidents/${encodeURIComponent(id)}/notes`, { method: "POST", body: JSON.stringify({ fields }) });
}

function geminiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const svc = JSON.parse(execSync(`gcloud run services describe scan --region us-central1 --project ${PROJECT} --format=json`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  const env = svc.spec.template.spec.containers.flatMap((c) => c.env || []);
  return (env.find((e) => e.name === "GEMINI_API_KEY") || {}).value;
}

const PROTOCOL = `You are being interrogated about a 411 Scanner incident you processed. You are given the COMPLETE incident file: the original specimen image itself, the phone's OCR text, every prompt that was sent and every raw response that came back, the grounding (searches and sources), and the final report.

Honesty protocol, above all else:
1. Label every statement: (a) OBSERVED directly in this incident file or image, (b) RECONSTRUCTED / inferred from it, (c) UNKNOWN.
2. Never confabulate. "That is not in the incident file" is a correct answer.
3. The specimen image is attached: when asked what it contains, read it from the image and quote it.
4. The server, not the model, computes action_meter_score from the six metrics. Do not claim otherwise.
5. Report mechanics only; no praise.`;

async function ask(id, question) {
  const inc = await getIncident(id);
  const trace = JSON.parse(await gcs(inc.traceUri));
  const parts = [];
  if (inc.specimen && inc.specimen.uri) {
    const bytes = await gcs(inc.specimen.uri, true);
    parts.push({ inlineData: { data: bytes.toString("base64"), mimeType: inc.specimen.mimeType || "image/jpeg" } });
  } else if (inc.kind === "deep_dive" && inc.cacheKey) {
    parts.push({ text: "(Deep Dive incident: its specimen is the scan's image, cacheKey " + inc.cacheKey + ".)" });
  }
  const calls = (trace.calls || []).map((c, i) =>
    `--- CALL ${i + 1}: pass=${c.pass} model=${c.model} systemPrompt=${c.systemPromptRef || "none"}\nUSER PARTS: ${JSON.stringify(c.parts).slice(0, 30000)}\nRAW RESPONSE: ${String(c.responseText || "").slice(0, 30000)}\nSEARCHES: ${JSON.stringify(c.grounding?.queries || [])}\nSOURCES: ${JSON.stringify((c.grounding?.sources || []).map((s) => s.title || s.uri))}`
  ).join("\n\n");
  const file = `=== INCIDENT ${id} (${inc.kind}, tag ${inc.tag}, ${new Date(inc.createdAtMs).toISOString()}) ===
INDEX: ${JSON.stringify({ uid: inc.uid, tier: inc.tier, charged: inc.charged, chargedVia: inc.chargedVia, score: inc.score, verdict: inc.verdict, target: inc.target, failureCode5: inc.failureCode5 })}
OCR TEXT FROM THE PHONE:
${trace.ocrText || "(none)"}
MODEL CALLS (verbatim):
${calls}
FINAL REPORT:
${JSON.stringify(trace.report).slice(0, 60000)}
FAILURE: ${JSON.stringify(trace.failure)}`;

  const history = [];
  for (const n of await notesOf(id)) {
    history.push({ role: "user", parts: [{ text: n.question }] }, { role: "model", parts: [{ text: n.answer }] });
  }
  const model = new GoogleGenerativeAI(geminiKey()).getGenerativeModel({
    model: MODEL,
    systemInstruction: `${PROTOCOL}\n\n${file}`,
    generationConfig: { temperature: 0.2, maxOutputTokens: 12000 },
  });
  // The specimen rides on the first turn, every session, so follow-ups
  // still see the image itself.
  if (history.length) history[0].parts.unshift(...parts);
  const chat = model.startChat({ history });
  const r = await chat.sendMessage([...(history.length ? [] : parts), { text: question }]);
  const answer = r.response.text();
  await addNote(id, { question, answer, model: MODEL, atMs: Date.now() });
  console.log(answer);
}

async function list(args) {
  const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : dflt; };
  const tag = opt("tag", null);
  const days = Number(opt("days", 7));
  const minScore = opt("min-score", null);
  const since = Date.now() - days * 86400000;
  const where = tag
    ? { fieldFilter: { field: { fieldPath: "tag" }, op: "EQUAL", value: { stringValue: tag } } }
    : { fieldFilter: { field: { fieldPath: "createdAtMs" }, op: "GREATER_THAN_OR_EQUAL", value: { integerValue: String(since) } } };
  const r = await api(`${FIRESTORE}:runQuery`, {
    method: "POST",
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: "incidents" }], where, limit: 1000 } }),
  });
  const rows = (await r.json()).filter((x) => x.document).map((x) => docFields(x.document))
    .filter((d) => d.createdAtMs >= since && (minScore === null || Number(d.score) >= Number(minScore)))
    .sort((a, b) => a.createdAtMs - b.createdAtMs);
  for (const d of rows) {
    console.log(`${new Date(d.createdAtMs).toISOString().slice(0, 16)}  ${d.requestId}  ${String(d.tag).padEnd(12)} score=${d.score ?? "-"}  ${d.target || d.kind}${d.failureCode5 ? "  FAILED " + d.failureCode5 : ""}`);
  }
  console.log(`${rows.length} incident(s)${tag ? ` tagged ${tag}` : ""} in the last ${days} day(s)`);
}

async function show(id) {
  const inc = await getIncident(id);
  console.log(JSON.stringify(inc, null, 2));
}

(async () => {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "ask" && rest[0]) return ask(rest[0], rest.slice(1).join(" ") || "Summarize this incident.");
  if (cmd === "list") return list(rest);
  if (cmd === "show" && rest[0]) return show(rest[0]);
  console.log('usage: incident.js ask <requestId> "<question>" | show <requestId> | list [--tag attack] [--days 7] [--min-score 8]');
})().catch((e) => { console.error("ERROR", e.message); process.exitCode = 1; });

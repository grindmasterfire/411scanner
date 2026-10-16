/**
 * Rebrand floor raiser (fire 2026-10-16): a rebrand is a CHANGE of name after
 * trouble, never concurrent trade names. UAC 4u's side brands scored +1.0.
 * Offline checks: prompt wording, the incident record, and the raisers report.
 * Live check (costs API): node scripts/rescore.js <requestId>
 * Run: node tests/rebrandRuleTest.js
 */
const assert = require("assert");
const { SYSTEM_PROMPT } = require("../prompt");
const { validatedFloorRaisers } = require("../incidentLedger");
const { buildFloorRaiserSummary, formatFloorRaiserSummary } = require("../floorRaiserReport");

// --- Prompt: the tightened rule is in the scoring prompt ---
for (const phrase of [
  "A rebrand pattern is a CHANGE of name or entity.",
  "the prior name or entity, the new name or entity, and the complaints, enforcement action, bad rating, lawsuit, or shutdown that preceded the change",
  "Concurrent trade names, DBAs, product-line brands, divisions, and sister companies operating side by side are NOT a rebrand pattern",
  "never set rebrand_pattern from them",
  "Never infer the purpose of a name.",
]) {
  assert.ok(SYSTEM_PROMPT.includes(phrase), `prompt missing: ${phrase}`);
}

// --- Server backstop: a rebrand is a name CHANGE, not side brands ---
{
  const { describesNameChange } = require("../rebrandEvidence");
  const { extractFloorRaisers } = require("../actionMeterFloorRaisers");
  const live = [
    // UAC, 2026-10-16 scans: side brands dressed up as a rebrand.
    "Operates concurrently and historically under shifting names including Universal AdCom, Hometown Productions, Premier Impressions, and Premier Map Company following consumer protection alerts and complaint spikes.",
    "Universal AdCom operates under a documented network of aliases and trade names, including UAC 4u, UACNow, Premier Impressions, Hometown Productions, Scoreboard Productions, and Academic Assets, to continue telemarketing despite widespread consumer protection alerts.",
  ];
  for (const e of live) assert.strictEqual(describesNameChange([e]), false, e.slice(0, 60));
  assert.strictEqual(describesNameChange(["The firm rebranded from Blackwater to Xe Services in 2009 and to Academi in 2011 after the 2007 Nisour Square shooting."]), true);
  assert.strictEqual(describesNameChange(["Formerly XYZ Capital; renamed after the 2024 SEC order."]), true);
  // A concurrent statement anywhere sinks the claim.
  assert.strictEqual(describesNameChange(["Formerly XYZ Capital.", "Operates side by side with XYZ Capital."]), false);
  assert.strictEqual(describesNameChange([]), false);

  const card = (ev) => ({ consumer_card: { floor_raisers: { rebrand_pattern: true }, floor_raiser_evidence: { rebrand_pattern: ev } } });
  assert.strictEqual(extractFloorRaisers(card([live[0]])).rebrandPattern, false, "live UAC wording rejected by the server");
  assert.strictEqual(extractFloorRaisers(card(["Renamed from Blackwater to Xe Services in 2009 after Nisour Square."])).rebrandPattern, true);
}

// --- Incident record: only accepted raisers, with their evidence ---
{
  const report = {
    consumer_card: {
      floor_raisers: { rebrand_pattern: true, advance_fee: true, brand_impersonation: false },
      floor_raiser_evidence: {
        rebrand_pattern: ["Blackwater renamed itself Xe Services in 2009 after the 2007 Nisour Square shooting."],
        advance_fee: [], // claimed without evidence: the server rejects it
        brand_impersonation: [],
      },
    },
  };
  assert.deepStrictEqual(validatedFloorRaisers(report), {
    rebrand_pattern: "Blackwater renamed itself Xe Services in 2009 after the 2007 Nisour Square shooting.",
  });
  assert.deepStrictEqual(validatedFloorRaisers(null), {});
}

// --- Report: counts, firings, and the rebrand check ---
{
  const incidents = [
    { kind: "scan", requestId: "uac", createdAtMs: 3, target: "UAC 4u", score: 9,
      floorRaisers: { rebrand_pattern: "Universal AdCom operates under a documented network of aliases and trade names, including UAC 4u, UACNow, Premier Impressions." } },
    { kind: "scan", requestId: "xe", createdAtMs: 2, target: "Academi", score: 9,
      floorRaisers: { rebrand_pattern: "Blackwater renamed itself Xe Services after the Nisour Square shooting.", confirmed_criminal: "Guards convicted." } },
    { kind: "scan", requestId: "clean", createdAtMs: 1, target: "Navy Federal", score: 1.8, floorRaisers: {} },
    { kind: "deep_dive", requestId: "dd", createdAtMs: 4, floorRaisers: {} },
  ];
  const s = buildFloorRaiserSummary(incidents);
  assert.strictEqual(s.scans, 3, "deep dives are not scans");
  assert.strictEqual(s.withRaisers, 2);
  assert.deepStrictEqual(s.byRaiser, { rebrand_pattern: 2, confirmed_criminal: 1 });
  assert.deepStrictEqual(s.rebrandChecks.map((f) => f.requestId), ["uac"], "trade-name evidence is flagged; a real rename is not");
  const text = formatFloorRaiserSummary(s, "test");
  assert.ok(text.includes("REBRAND CHECK: 1"));
  assert.ok(text.includes("uac  UAC 4u (9)"));
  assert.ok(text.startsWith("FLOOR RAISERS — test"));
  assert.ok(formatFloorRaiserSummary(buildFloorRaiserSummary([]), "empty").includes("Rebrand check: 0"));
}

console.log("rebrandRuleTest: all passed");

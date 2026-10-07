/**
 * @file functions/scripts/business-center.js
 * @class Class 3 (Feature Component)
 * @cap 400 Lines
 * @responsibility Read immutable T07 scan receipts and provide the operator-facing 411 Business Center CLI.
 * @dependencies firebase-admin, ../businessCenterReport
 * @security_gate Read-only operator utility. Never invokes Gemini or mutates production data.
 * @owner_context 411 Scanner T07 Business Center terminal reporting.
 *
 * This is intentionally one cohesive operator feature rather than several
 * microfiles: it owns Firebase access, period selection, single-receipt
 * presentation, aggregate report presentation, and CLI dispatch.
 *
 * Usage:
 * node scripts/business-center.js last
 * node scripts/business-center.js today
 * node scripts/business-center.js week
 * node scripts/business-center.js month
 * node scripts/business-center.js revenue [today|week|month]
 * node scripts/business-center.js trend   (this week vs last week)
 *
 * Calendar periods use UTC deliberately so accounting boundaries do not
 * depend on the workstation's local timezone.
 */

const admin =
  require("firebase-admin");

const {
  buildBusinessSummary,
  formatBusinessSummary,
  buildRevenueSummary,
  formatRevenueSummary,
  buildDeepDiveSummary,
  formatDeepDiveSummary,
} = require("../businessCenterReport");

const {
  REVENUE_EVENTS_COLLECTION,
} = require("../revenueEvents");

const PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID ||
  process.env.GCLOUD_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  "scanner-4ea67";

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: PROJECT_ID,
  });
}

const db =
  admin.firestore();

function money(value) {
  const parsed =
    Number(value);

  const safe =
    Number.isFinite(parsed)
      ? parsed
      : 0;

  return `$${safe.toFixed(4)}`;
}

function integer(value) {
  return Math.round(
    Number(value) || 0
  ).toLocaleString("en-US");
}

function timestampText(value) {
  if (!value) {
    return "unknown";
  }

  if (
    typeof value.toDate ===
    "function"
  ) {
    return value
      .toDate()
      .toISOString();
  }

  return String(value);
}

/**
 * Print one permanent request receipt for a non-specialist operator.
 */
function printReceipt(receipt) {
  const usage =
    receipt.usage || {};

  const cost =
    receipt.cost || {};

  const plain =
    receipt.plainEnglish || {};

  console.log("");
  console.log(
    "========================================"
  );
  console.log(
    "411 SCAN RECEIPT"
  );
  console.log(
    "========================================"
  );

  console.log(
    `Timestamp: ${timestampText(receipt.createdAt)}`
  );

  console.log(
    `Target: ${receipt.targetName || "Unknown Target"}`
  );

  console.log(
    `Request mode: ${receipt.mode || "unknown"}`
  );

  console.log(
    `Request ID: ${receipt.requestId || "unknown"}`
  );

  console.log(
    `Investigation ID: ${
      receipt.investigationId ||
      receipt.sourceInvestigationId ||
      "none"
    }`
  );

  console.log(
    `Model: ${receipt.model || "none"}`
  );

  console.log(
    "----------------------------------------"
  );

  console.log(
    `Prompt tokens: ${integer(usage.promptTokens)}`
  );

  console.log(
    `Output tokens: ${integer(usage.outputTokens)}`
  );

  console.log(
    `Thought tokens: ${integer(usage.thoughtTokens)}`
  );

  console.log(
    `Cached-content tokens: ${integer(usage.cachedContentTokens)}`
  );

  console.log(
    `Total tokens: ${integer(usage.totalTokens)}`
  );

  console.log(
    `Google searches: ${integer(usage.googleSearchQueries)}`
  );

  console.log(
    "----------------------------------------"
  );

  console.log(
    `Gemini token cost: ${money(cost.tokenCostUsd)}`
  );

  console.log(
    `Google grounding: ${money(cost.groundingCostUsdAtPaidRate)}`
  );

  console.log(
    `THIS REQUEST COST: ${money(cost.requestResearchCostUsdAtPaidRate)}`
  );

  if (
    cost
      .originalResearchCostUsdAtPaidRate !==
      null &&
    cost
      .originalResearchCostUsdAtPaidRate !==
      undefined
  ) {
    console.log(
      `Original research cost: ${money(
        cost.originalResearchCostUsdAtPaidRate
      )}`
    );
  }

  console.log(
    "----------------------------------------"
  );

  if (plain.whatHappened) {
    console.log(
      plain.whatHappened
    );
  }

  if (plain.costDriver) {
    console.log(
      plain.costDriver
    );
  }

  if (plain.provenance) {
    console.log(
      plain.provenance
    );
  }

  console.log(
    "========================================"
  );
}

/**
 * Resolve the beginning of a named UTC accounting period.
 */
function getPeriodStart(mode) {
  const now =
    new Date();

  if (mode === "today") {
    return new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate()
      )
    );
  }

  if (mode === "week") {
    const start =
      new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate()
        )
      );

    const day =
      start.getUTCDay();

    const daysSinceMonday =
      day === 0
        ? 6
        : day - 1;

    start.setUTCDate(
      start.getUTCDate() -
      daysSinceMonday
    );

    return start;
  }

  if (mode === "month") {
    return new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        1
      )
    );
  }

  return null;
}

async function readLastReceipt() {
  const snapshot =
    await db
      .collection(
        "scan_receipts"
      )
      .orderBy(
        "createdAt",
        "desc"
      )
      .limit(1)
      .get();

  if (snapshot.empty) {
    console.log(
      "411 Business Center: no scan receipts found."
    );

    return;
  }

  printReceipt(
    snapshot.docs[0].data()
  );
}

async function readPeriod(mode) {
  const start =
    getPeriodStart(mode);

  const startTs =
    admin.firestore.Timestamp
      .fromDate(start);

  const [receiptSnap, diveSnap] =
    await Promise.all([
      db
        .collection(
          "scan_receipts"
        )
        .where(
          "createdAt",
          ">=",
          startTs
        )
        .orderBy(
          "createdAt",
          "desc"
        )
        .get(),
      db
        .collection(
          "deepdive_receipts"
        )
        .where(
          "createdAt",
          ">=",
          startTs
        )
        .orderBy(
          "createdAt",
          "desc"
        )
        .get(),
    ]);

  const receipts =
    receiptSnap.docs.map(
      (doc) =>
        doc.data()
    );

  const dives =
    diveSnap.docs.map(
      (doc) =>
        doc.data()
    );

  const label =
    `${mode.toUpperCase()} UTC — since ${start.toISOString()}`;

  console.log(
    formatBusinessSummary(
      buildBusinessSummary(
        receipts
      ),
      label
    )
  );

  console.log(
    formatDeepDiveSummary(
      buildDeepDiveSummary(
        dives
      ),
      label
    )
  );
}

/**
 * Revenue report for a UTC period: revenue events joined with the scan
 * cost summary for the same period, so the profit line is apples-to-apples.
 *
 * Usage: node scripts/business-center.js revenue [today|week|month]
 */
async function readRevenue(period) {
  const start =
    getPeriodStart(period);

  const startTs =
    admin.firestore.Timestamp.fromDate(
      start
    );

  const [revenueSnap, receiptSnap] =
    await Promise.all([
      db
        .collection(
          REVENUE_EVENTS_COLLECTION
        )
        .where(
          "createdAt",
          ">=",
          startTs
        )
        .orderBy(
          "createdAt",
          "desc"
        )
        .get(),
      db
        .collection(
          "scan_receipts"
        )
        .where(
          "createdAt",
          ">=",
          startTs
        )
        .get(),
    ]);

  const events =
    revenueSnap.docs.map(
      (doc) =>
        doc.data()
    );

  const receipts =
    receiptSnap.docs.map(
      (doc) =>
        doc.data()
    );

  const costSummary =
    buildBusinessSummary(
      receipts
    );

  const incurredCost =
    costSummary.costTotals
      .incurredResearchCostUsdAtPaidRate;

  const label =
    `${period.toUpperCase()} UTC — since ${start.toISOString()}`;

  console.log(
    formatRevenueSummary(
      buildRevenueSummary(
        events
      ),
      incurredCost,
      label
    )
  );
}

/**
 * Week-over-week trend: this week vs last week on the metrics that matter.
 * Deltas are shown as absolute change plus direction — no percentages on
 * small numbers (they lie).
 *
 * Usage: node scripts/business-center.js trend
 */
async function readTrend() {
  const thisWeekStart =
    getPeriodStart("week");
  const lastWeekStart = new Date(
    thisWeekStart.getTime() -
      7 * 24 * 3600 * 1000
  );

  const startTsThis =
    admin.firestore.Timestamp.fromDate(
      thisWeekStart
    );
  const startTsLast =
    admin.firestore.Timestamp.fromDate(
      lastWeekStart
    );
  const endTsLast =
    admin.firestore.Timestamp.fromDate(
      thisWeekStart
    );

  async function readRange(
    collection,
    startTs,
    endTs
  ) {
    let query = db
      .collection(collection)
      .where(
        "createdAt",
        ">=",
        startTs
      );
    if (endTs) {
      query = query.where(
        "createdAt",
        "<",
        endTs
      );
    }
    const snap = await query.get();
    return snap.docs.map(
      (doc) => doc.data()
    );
  }

  const [
    receiptsThis,
    receiptsLast,
    eventsThis,
    eventsLast,
  ] = await Promise.all([
    readRange(
      "scan_receipts",
      startTsThis,
      null
    ),
    readRange(
      "scan_receipts",
      startTsLast,
      endTsLast
    ),
    readRange(
      REVENUE_EVENTS_COLLECTION,
      startTsThis,
      null
    ),
    readRange(
      REVENUE_EVENTS_COLLECTION,
      startTsLast,
      endTsLast
    ),
  ]);

  const businessThis =
    buildBusinessSummary(
      receiptsThis
    );
  const businessLast =
    buildBusinessSummary(
      receiptsLast
    );
  const revenueThis =
    buildRevenueSummary(
      eventsThis
    );
  const revenueLast =
    buildRevenueSummary(
      eventsLast
    );

  function deltaLine(
    label,
    thisValue,
    lastValue,
    format
  ) {
    const diff =
      thisValue - lastValue;
    const arrow =
      diff > 0
        ? "▲"
        : diff < 0
          ? "▼"
          : "■";
    const sign =
      diff > 0 ? "+" : "";
    return (
      `  ${label}: ${format(thisValue)} ` +
      `${arrow} ${sign}${format(diff)} vs last week ` +
      `(${format(lastValue)})`
    );
  }

  const intFmt = (v) =>
    Math.round(v).toLocaleString(
      "en-US"
    );
  const moneyFmt = (v) =>
    `$${Number(v).toFixed(2)}`;
  const pctFmt = (v) =>
    `${(Number(v) * 100).toFixed(1)}%`;

  const costThis =
    businessThis.costTotals
      .incurredResearchCostUsdAtPaidRate;
  const costLast =
    businessLast.costTotals
      .incurredResearchCostUsdAtPaidRate;
  const revThis =
    revenueThis.grantedRevenueUsd;
  const revLast =
    revenueLast.grantedRevenueUsd;

  const lines = [
    "",
    "========================================",
    "411 SCANNER TREND — WEEK OVER WEEK",
    "========================================",
    `This week: since ${thisWeekStart.toISOString()}`,
    `Last week: ${lastWeekStart.toISOString()} to ${thisWeekStart.toISOString()}`,
    "",
    "VOLUME",
    deltaLine(
      "Requests",
      businessThis.requestCount,
      businessLast.requestCount,
      intFmt
    ),
    deltaLine(
      "Resolved scans",
      businessThis.resolvedRequests,
      businessLast.resolvedRequests,
      intFmt
    ),
    deltaLine(
      "Cache hit rate",
      businessThis.cacheHitRate,
      businessLast.cacheHitRate,
      pctFmt
    ),
    "",
    "MONEY",
    deltaLine(
      "AI research cost",
      costThis,
      costLast,
      moneyFmt
    ),
    deltaLine(
      "Gross revenue",
      revThis,
      revLast,
      moneyFmt
    ),
    deltaLine(
      "Gross margin",
      revThis - costThis,
      revLast - costLast,
      moneyFmt
    ),
    "",
    "RELIABILITY",
    deltaLine(
      "Coded failures",
      Object.values(
        businessThis.failureCodes || {}
      ).reduce(
        (t, e) => t + e.count,
        0
      ),
      Object.values(
        businessLast.failureCodes || {}
      ).reduce(
        (t, e) => t + e.count,
        0
      ),
      intFmt
    ),
    deltaLine(
      "Grounding rejected",
      businessThis.groundingRejectedRequests,
      businessLast.groundingRejectedRequests,
      intFmt
    ),
    "",
    "In plain terms: are we growing, and is each week healthier than the",
    "last? Rising requests with a steady or rising margin is the shape",
    "you want. Rising costs without rising revenue is the shape you don't.",
    "========================================",
  ];

  console.log(lines.join("\n"));
}

async function main() {
  const mode =
    String(
      process.argv[2] ||
      "last"
    ).toLowerCase();

  if (mode === "last") {
    await readLastReceipt();
    return;
  }

  if (mode === "trend") {
    await readTrend();
    return;
  }

  if (mode === "revenue") {
    const period =
      String(
        process.argv[3] ||
        "week"
      ).toLowerCase();

    if (
      ![
        "today",
        "week",
        "month",
      ].includes(
        period
      )
    ) {
      throw new Error(
        "Use: revenue [today|week|month]"
      );
    }

    await readRevenue(period);
    return;
  }

  const aggregateModes = [
    "today",
    "week",
    "month",
  ];

  if (
    !aggregateModes.includes(
      mode
    )
  ) {
    throw new Error(
      "Use one of: last, today, week, month, revenue [today|week|month], trend"
    );
  }

  await readPeriod(mode);
}

main().catch((error) => {
  console.error(
    "411 Business Center failed:",
    error.message
  );

  console.error(
    `Firebase Project: ${PROJECT_ID}`
  );

  console.error(
    "This reader requires Google application credentials with read access to Firestore."
  );

  process.exitCode = 1;
});

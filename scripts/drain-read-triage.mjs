// Continuous read-triage drain: runs triageReadState back-to-back until the
// candidate pool is empty (or the process is stopped with Ctrl-C), instead of
// waiting for the 30-minute scheduler between batches.
//
// Calls triageReadState directly, NOT runReadTriagePass — so no report email
// is sent at any point. The .QWN/.HKU marker labels are the record of what
// was reviewed and by which engine.
//
// Run from repo root:  node scripts/drain-read-triage.mjs
// Stops on: empty pool, no forward progress, or SIGINT.
process.chdir("Y:\\gmail-triage\\config");

const { getGmailClient } = await import(
  `file:///F:/AI/fstrasz/gmail-triage/app/lib/gmail.js?t=${Date.now()}`
);
const { triageReadState, fetchCandidateIds } = await import(
  `file:///F:/AI/fstrasz/gmail-triage/app/lib/readTriage.js?t=${Date.now()}`
);
const { classifyReadStateHybrid } = await import(
  `file:///F:/AI/fstrasz/gmail-triage/app/lib/localLlm.js?t=${Date.now()}`
);
const { loadSettings } = await import(
  `file:///F:/AI/fstrasz/gmail-triage/app/lib/settings.js?t=${Date.now()}`
);

if (!process.env.OLLAMA_HOST) {
  console.error("[drain] OLLAMA_HOST is not set — every chunk would fall back to Claude.");
  console.error("[drain] Set it, e.g.  OLLAMA_HOST=100.112.97.92 node scripts/drain-read-triage.mjs");
  process.exit(1);
}

// The drain forces its own flags rather than flipping them in the shared
// settings.json: that file is also read by the live NAS container every 30
// minutes, and enabling it there would have the container racing this drain
// over the same candidate pool and double-billing the classifier.
const drainSettings = () => ({
  ...loadSettings(),
  readTriageEnabled: true,
  readTriageLocalModelEnabled: true,
});
const classify = (messages, client) =>
  classifyReadStateHybrid(messages, client, { getSettings: drainSettings });

let stopping = false;
process.on("SIGINT", () => {
  console.log("\n[drain] stop requested — finishing the current batch, then exiting");
  stopping = true;
});

const gmail = await getGmailClient();

const startCount = (await fetchCandidateIds(gmail)).length;
console.log(`[drain] starting: ${startCount} candidate(s) in the pool`);

const totals = { cleared: 0, kept: 0, labeled: 0, failed: 0, batches: 0 };
const t0 = Date.now();

while (!stopping) {
  const result = await triageReadState(gmail, {
    getSettings: drainSettings,
    classify,
  });

  if (!result.enabled) {
    console.error("[drain] readTriageEnabled is false — nothing to do.");
    break;
  }

  totals.batches++;
  totals.cleared += result.cleared;
  totals.kept += result.kept.length;
  totals.labeled += result.labeled || 0;
  totals.failed += result.failedCount || 0;

  const remaining = result.skipped + (result.coolingDown || 0);
  console.log(
    `[drain] batch ${totals.batches}: ${result.cleared} cleared, ` +
      `${result.kept.length} kept, ${result.labeled || 0} labeled, ` +
      `${result.failedCount || 0} failed | ~${remaining} left ` +
      `(${Math.round((Date.now() - t0) / 1000)}s elapsed)`,
  );

  // Nothing marked reviewed and nothing cleared ⇒ this batch made no forward
  // progress. Without this the loop would spin on a pool that is entirely
  // cooling down after failures.
  if (!result.labeled && !result.cleared) {
    console.log("[drain] no forward progress this batch — stopping");
    break;
  }

  // Pool exhausted: nothing over the per-run cap and nothing throttled.
  if (result.skipped === 0 && (result.coolingDown || 0) === 0) {
    console.log("[drain] candidate pool exhausted");
    break;
  }
}

const finalCount = (await fetchCandidateIds(gmail)).length;
console.log(
  `\n[drain] done: ${totals.batches} batch(es), ${totals.cleared} cleared, ` +
    `${totals.kept} kept, ${totals.labeled} labeled, ${totals.failed} failed`,
);
console.log(
  `[drain] pool ${startCount} → ${finalCount} in ${Math.round((Date.now() - t0) / 1000)}s`,
);

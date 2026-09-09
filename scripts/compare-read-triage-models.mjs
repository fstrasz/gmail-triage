// Dry-run comparison: Claude Haiku (production baseline) vs local Ollama
// models on read-triage classification, over the SAME real candidate
// messages. Read-only — fetches and classifies only, never calls
// batchModify, so it cannot clear UNREAD on anything.
//
// Run from repo root: node scripts/compare-read-triage-models.mjs
// Optional: OLLAMA_HOST env var (default 100.112.97.92).
//
// chdir before any cwd-sensitive module loads (gmail.js captures
// process.cwd()/token.json at import time) — same gotcha documented in
// ~/.claude/references/esm-tests.md; cache-busted dynamic imports required.
process.chdir("Y:\\gmail-triage\\config");

const { getGmailClient } = await import(`../app/lib/gmail.js?t=${Date.now()}`);
const {
  fetchCandidateIds,
  hydrateCandidate,
  READ_TRIAGE_MAX_PER_RUN,
  READ_TRIAGE_FETCH_CONCURRENCY,
} = await import(`../app/lib/readTriage.js?t=${Date.now()}`);
const { classifyReadState } = await import(`../app/lib/claude.js?t=${Date.now()}`);
const { classifyReadStateLocal } = await import(
  `../app/lib/localLlm.js?t=${Date.now()}`
);
const { mapWithConcurrency } = await import(
  `../app/lib/claudeUtils.js?t=${Date.now()}`
);

const OLLAMA_HOST = process.env.OLLAMA_HOST || "100.112.97.92";
const LOCAL_MODELS = ["gpt-oss:120b", "qwen3.8:27b"];
const PROVIDERS = ["claude", ...LOCAL_MODELS];

// Mirrors triageReadState's actual clearing condition exactly — a decision
// only clears UNREAD if it's a confident "read". Applying the same rule to
// the local models' output means the comparison measures what would really
// happen in production, not just the raw decision value.
function wouldClear(decisionMap, id) {
  const d = decisionMap.get(id);
  return Boolean(d && d.decision === "read" && !d.uncertain);
}

async function main() {
  const gmail = await getGmailClient();

  console.error("Fetching candidate ids...");
  const allIds = await fetchCandidateIds(gmail);
  const ids = allIds.slice(-READ_TRIAGE_MAX_PER_RUN);
  console.error(`${allIds.length} candidate(s) found, comparing on ${ids.length}`);

  if (!ids.length) {
    console.error("No candidates to compare.");
    return;
  }

  const messages = await mapWithConcurrency(
    ids,
    READ_TRIAGE_FETCH_CONCURRENCY,
    (id) => hydrateCandidate(gmail, id),
  );

  const results = {};

  console.error("Classifying with Claude (baseline)...");
  let t0 = Date.now();
  results.claude = await classifyReadState(messages);
  results.claude.ms = Date.now() - t0;

  for (const model of LOCAL_MODELS) {
    console.error(`Classifying with ${model}...`);
    t0 = Date.now();
    results[model] = await classifyReadStateLocal(messages, {
      model,
      host: OLLAMA_HOST,
    });
    results[model].ms = Date.now() - t0;
  }

  const decisionMaps = {};
  for (const p of PROVIDERS) {
    decisionMaps[p] = new Map(results[p].decisions.map((d) => [d.id, d]));
  }

  const rows = messages.map((m) => {
    const row = { id: m.id, from: m.from, subject: m.subject.slice(0, 60) };
    for (const p of PROVIDERS) {
      const d = decisionMaps[p].get(m.id);
      row[p] = d ? d.decision + (d.uncertain ? "?" : "") : "(missing)";
    }
    return row;
  });

  console.log("\n=== Per-message comparison ===");
  console.table(rows);

  console.log("\n=== Agreement vs Claude (would-clear decision) ===");
  for (const model of LOCAL_MODELS) {
    const agree = messages.filter(
      (m) =>
        wouldClear(decisionMaps.claude, m.id) ===
        wouldClear(decisionMaps[model], m.id),
    ).length;
    console.log(
      `${model}: ${agree}/${messages.length} agree with Claude, ` +
        `${results[model].ms}ms total, ${results[model].failedIds.length} failed chunk message(s)`,
    );
  }
  console.log(
    `claude: baseline, ${results.claude.ms}ms total, ${results.claude.failedIds.length} failed chunk message(s)`,
  );

  // The one failure mode this feature can't tolerate: Claude would have left
  // it unread, and a local model would confidently clear it.
  const dangerous = messages
    .filter((m) =>
      LOCAL_MODELS.some(
        (model) =>
          !wouldClear(decisionMaps.claude, m.id) &&
          wouldClear(decisionMaps[model], m.id),
      ),
    )
    .map((m) => rows.find((r) => r.id === m.id));

  console.log(
    "\n=== DANGEROUS mismatches (Claude would keep unread, a local model would clear) ===",
  );
  if (!dangerous.length) console.log("none");
  else console.table(dangerous);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

// ─── Read/unread triage ────────────────────────────────────────────────────
// Core pass for docs/superpowers/specs/2026-08-20-read-unread-triage-design.md.
// Finds unread, tiered (..OK/..VIP) inbox mail, asks classifyReadState which
// of it Frank still needs to see, and clears UNREAD on exactly the messages
// it confidently marks "read". Fail-safe: anything missing from the
// classifier result, anything uncertain, and anything "unread" stays UNREAD.
//
// Only ever removes the UNREAD label — never adds/removes anything else,
// never archives/trashes/moves. UNREAD is a Gmail system label whose id is
// its own name (used literally everywhere else in this codebase, e.g.
// keepClean.js), so no ensureLabel resolution is needed here: this module
// never touches ..OK/..VIP as a label target, only as a query filter.
import { getEmailBodyText } from "./eventSearch.js";
import { classifyReadState } from "./claude.js";
import { mapWithConcurrency } from "./claudeUtils.js";
import { loadSettings, setLastReadTriage } from "./settings.js";

// Gmail enforces a per-minute per-user quota. Hydrating every candidate at once
// with Promise.all blew it on the first production run ("Quota exceeded for
// quota metric 'Queries' and limit 'Units per minute per user'"), and because
// runReadTriagePass fails soft, the pass silently did nothing — on exactly the
// accumulated backlog it exists to clear (F29). Same class as F18, where the
// DelPend summary blew the same quota on 1000+ messages and was fixed with a
// top-N cap.
//
// Two bounds, both needed: a cap on how many messages one run will touch, and
// bounded concurrency on the fetches themselves. The cap alone would still
// fire 100 simultaneous requests; the concurrency alone would still walk a
// 2000-message backlog in one run.
const READ_TRIAGE_MAX_PER_RUN = 100;
const READ_TRIAGE_FETCH_CONCURRENCY = 5;

// One call, the app's own working label-query syntax (corrected from the
// spec's MCP-connector wording — see the design doc's mechanics table).
const CANDIDATE_QUERY =
  "in:inbox is:unread {label:..OK label:..VIP} -in:sent -in:trash";

async function fetchCandidateIds(gmail) {
  const ids = [];
  let pageToken = null;
  do {
    const params = { userId: "me", q: CANDIDATE_QUERY, maxResults: 500 };
    if (pageToken) params.pageToken = pageToken;
    const res = await gmail.users.messages.list(params);
    for (const m of res.data.messages || []) ids.push(m.id);
    pageToken = res.data.nextPageToken || null;
  } while (pageToken);
  return ids;
}

async function hydrateCandidate(gmail, id) {
  const res = await gmail.users.messages.get({
    userId: "me",
    id,
    format: "full",
  });
  const headers = res.data.payload?.headers || [];
  const g = (n) => headers.find((h) => h.name === n)?.value || "";
  return {
    id,
    from: g("From"),
    subject: g("Subject"),
    date: g("Date"),
    snippet: res.data.snippet || "",
    body: getEmailBodyText(res.data.payload),
  };
}

// `deps` overrides are for tests only — defaults are the real settings.js
// functions and the real classifier (via classifyReadState, itself defaulting
// to the real Anthropic client). Production callers just call
// triageReadState(gmail).
export async function triageReadState(
  gmail,
  {
    anthropicClient,
    getSettings = loadSettings,
    recordClear = setLastReadTriage,
    classify = classifyReadState,
  } = {},
) {
  if (!getSettings().readTriageEnabled) {
    return { enabled: false, cleared: 0, kept: [] };
  }

  const allIds = await fetchCandidateIds(gmail);
  if (!allIds.length) {
    return { enabled: true, cleared: 0, kept: [], skipped: 0 };
  }

  // Oldest first: a backlog should drain from the far end, and the newest mail
  // is the most likely to still be sitting in front of the operator anyway.
  const ids = allIds.slice(-READ_TRIAGE_MAX_PER_RUN);
  const skipped = allIds.length - ids.length;

  const messages = await mapWithConcurrency(
    ids,
    READ_TRIAGE_FETCH_CONCURRENCY,
    (id) => hydrateCandidate(gmail, id),
  );
  const { decisions, failedIds } = await classify(messages, anthropicClient);
  const byId = new Map(decisions.map((d) => [d.id, d]));
  const failedSet = new Set(failedIds);

  const clearIds = [];
  const kept = [];
  for (const m of messages) {
    const d = byId.get(m.id);
    // Fail-safe: only a confident, non-uncertain "read" clears. Missing,
    // uncertain, or "unread" all stay unread.
    if (d && d.decision === "read" && !d.uncertain) {
      clearIds.push(m.id);
      continue;
    }
    kept.push({
      from: m.from,
      subject: m.subject,
      reason: failedSet.has(m.id)
        ? "classifier error this run — left unread"
        : d?.reason || "",
      amounts: d?.amounts || [],
      dates: d?.dates || [],
      uncertain: d?.uncertain || false,
    });
  }

  for (let i = 0; i < clearIds.length; i += 1000) {
    await gmail.users.messages.batchModify({
      userId: "me",
      requestBody: {
        ids: clearIds.slice(i, i + 1000),
        removeLabelIds: ["UNREAD"],
      },
    });
  }
  // Only record when something actually cleared — an empty run must not
  // clobber a previous run's undo record.
  if (clearIds.length) recordClear(clearIds);

  return {
    enabled: true,
    cleared: clearIds.length,
    kept,
    failedCount: failedIds.length,
    // Surfaced so a capped run is visible in the report rather than looking
    // like the whole backlog was handled.
    skipped,
  };
}

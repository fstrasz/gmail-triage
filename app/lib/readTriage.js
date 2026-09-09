// ─── Read/unread triage ────────────────────────────────────────────────────
// Core pass for docs/superpowers/specs/2026-08-20-read-unread-triage-design.md.
// Finds unread, tiered (..OK/..VIP) inbox mail, asks classifyReadState which
// of it Frank still needs to see, and clears UNREAD on exactly the messages
// it confidently marks "read". Fail-safe: anything missing from the
// classifier result, anything uncertain, and anything "unread" stays UNREAD.
//
// Removes the UNREAD label, and adds a provider marker label (.QWN / .HKU)
// recording which engine reviewed the message. Never archives/trashes/moves,
// and never touches ..OK/..VIP as a label target — only as a query filter.
// UNREAD is a Gmail system label whose id is its own name (used literally
// everywhere else in this codebase, e.g. keepClean.js); the marker labels are
// real user labels and so need ensureLabel resolution.
//
// The marker label is what makes a reviewed message permanently ineligible:
// CANDIDATE_QUERY excludes both markers, so Gmail's own index stops returning
// it. That matters most for messages the classifier KEEPS — they stay unread
// forever by design, so without the marker they sit at the oldest end of the
// pool and are re-billed for an identical answer on every future run.
import { getEmailBodyText } from "./eventSearch.js";
import { PROVIDER_HAIKU, PROVIDER_QWEN } from "./claude.js";
import { classifyReadStateHybrid } from "./localLlm.js";
import { ensureLabel } from "./gmail.js";
import { mapWithConcurrency } from "./claudeUtils.js";
import {
  loadSettings,
  setLastReadTriage,
  setReadTriageCooldown,
} from "./settings.js";

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
export const READ_TRIAGE_MAX_PER_RUN = 100;
export const READ_TRIAGE_FETCH_CONCURRENCY = 5;

// Marker labels: applied to any message an engine actually reviewed, and
// excluded by CANDIDATE_QUERY so it is never a candidate again. Single-dot
// prefix matches the .DelPend convention for utility labels (the double-dot
// prefix is reserved for the ..VIP/..OK tiers).
export const READ_TRIAGE_LABELS = {
  [PROVIDER_QWEN]: ".QWN",
  [PROVIDER_HAIKU]: ".HKU",
};

// Applies ONLY to messages no engine could classify (local malformed AND the
// Claude fallback errored). Everything successfully reviewed is excluded
// permanently by its marker label instead, so this is not the mechanism that
// stops keepers being re-billed — it is a short throttle so one chunk that
// fails deterministically on content (exactly what the lone-surrogate bug
// did: same chunk, every run) cannot park at the head of the oldest-first
// queue and block every later run from draining. Deliberately SHORT: most
// failures are transient API blips, and a long window would delay recovery
// from a 30-second outage by the length of that window.
export const READ_TRIAGE_FAILURE_COOLDOWN_HOURS = 1;

function isInCooldown(cooldown, id, now) {
  const ts = cooldown[id];
  if (!ts) return false;
  return (
    now - new Date(ts).getTime() <
    READ_TRIAGE_FAILURE_COOLDOWN_HOURS * 3600000
  );
}

// One call, the app's own working label-query syntax (corrected from the
// spec's MCP-connector wording — see the design doc's mechanics table).
// The two marker exclusions are what make a reviewed message permanently
// ineligible — Gmail's index drops it before it ever reaches this process,
// so there is no local state to consult and no expiry to leak through.
const CANDIDATE_QUERY =
  "in:inbox is:unread {label:..OK label:..VIP} -in:sent -in:trash -label:.QWN -label:.HKU";

export async function fetchCandidateIds(gmail) {
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

export async function hydrateCandidate(gmail, id) {
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
    recordCooldown = setReadTriageCooldown,
    classify = classifyReadStateHybrid,
  } = {},
) {
  const settings = getSettings();
  if (!settings.readTriageEnabled) {
    return { enabled: false, cleared: 0, kept: [] };
  }

  const allIds = await fetchCandidateIds(gmail);
  if (!allIds.length) {
    return { enabled: true, cleared: 0, kept: [], skipped: 0, coolingDown: 0 };
  }

  const now = Date.now();
  const allIdsSet = new Set(allIds);
  // Prune entries for messages no longer in the candidate pool (cleared by
  // this app, or read/archived by the operator directly) so the map doesn't
  // grow forever with ids that will never be selected again anyway.
  const cooldown = {};
  for (const [id, ts] of Object.entries(settings.readTriageCooldown || {})) {
    if (allIdsSet.has(id)) cooldown[id] = ts;
  }

  const eligibleIds = allIds.filter((id) => !isInCooldown(cooldown, id, now));
  const coolingDown = allIds.length - eligibleIds.length;

  // Oldest first: a backlog should drain from the far end, and the newest mail
  // is the most likely to still be sitting in front of the operator anyway.
  const ids = eligibleIds.slice(-READ_TRIAGE_MAX_PER_RUN);
  const skipped = eligibleIds.length - ids.length;

  if (!ids.length) {
    // Nothing eligible this run (everything is cooling down) — still persist
    // the pruned map so stale entries don't linger, but there's nothing to
    // classify or report.
    recordCooldown(cooldown);
    return { enabled: true, cleared: 0, kept: [], skipped, coolingDown };
  }

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
  const reviewedByProvider = { [PROVIDER_QWEN]: [], [PROVIDER_HAIKU]: [] };
  const nowIso = new Date(now).toISOString();
  for (const m of messages) {
    const d = byId.get(m.id);

    if (d) {
      // An engine actually answered. Mark it so it is never a candidate
      // again — whichever way the decision went — and drop any failure
      // cooldown left over from an earlier attempt.
      reviewedByProvider[d.provider]?.push(m.id);
      delete cooldown[m.id];
    } else {
      // Nothing could classify it (local malformed AND the Claude fallback
      // errored). No marker: it was not reviewed, so it must remain
      // eligible. Short cooldown only, so a deterministically-failing chunk
      // cannot park at the head of the oldest-first queue forever.
      cooldown[m.id] = nowIso;
    }

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

  // Marker labels before the UNREAD clear: a crash between the two then
  // leaves a message labeled-but-still-unread (mere clutter, and the
  // fail-safe direction) rather than cleared-but-unlabeled.
  let labeled = 0;
  for (const [provider, providerIds] of Object.entries(reviewedByProvider)) {
    if (!providerIds.length) continue;
    const labelId = await ensureLabel(gmail, READ_TRIAGE_LABELS[provider]);
    for (let i = 0; i < providerIds.length; i += 1000) {
      await gmail.users.messages.batchModify({
        userId: "me",
        requestBody: {
          ids: providerIds.slice(i, i + 1000),
          addLabelIds: [labelId],
        },
      });
    }
    labeled += providerIds.length;
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
  recordCooldown(cooldown);

  return {
    enabled: true,
    cleared: clearIds.length,
    kept,
    failedCount: failedIds.length,
    // Surfaced so a capped run is visible in the report rather than looking
    // like the whole backlog was handled.
    skipped,
    // Messages still throttled after a failed classification attempt.
    coolingDown,
    // Messages marked with a provider label this run, and therefore never
    // eligible again. A drain loop uses this to know it is making progress.
    labeled,
  };
}

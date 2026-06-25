import { isListedSender } from "./listedSender.js";
import { isBlocked } from "./blocklist.js";
import { extractEmail, extractName } from "./gmail.js";

export function shapeTriageEmail(e) {
  const fromEmail = e.fromEmail ?? (e.from ? extractEmail(e.from) : null);
  const fromName  = e.fromName  ?? (e.from ? extractName(e.from)  : null);
  return {
    id: e.id, threadId: e.threadId,
    fromEmail, fromName,
    subject: e.subject || "", snippet: e.snippet || "", date: e.date || "",
    tier: e.tier ?? null, ruleLabels: e.ruleLabels || [],
    hasUnsub: !!e.listUnsubscribe,
    unsubUrl:  e.listUnsubscribe     || null,
    unsubPost: e.listUnsubscribePost || null,
  };
}

export function filterHidden(emails, { hideListed }) {
  return emails.filter(e => {
    const em = e.fromEmail ?? (e.from ? extractEmail(e.from) : "");
    const nm = e.fromName  ?? (e.from ? extractName(e.from)  : null);
    if (isBlocked(em, nm)) return false;                // always exclude blocked
    if (hideListed && isListedSender(em, nm)) return false;
    return true;
  });
}

// ─── Unified triage-action dispatch (new React API) ───────────────────────────
// Data table only: the /api/triage/action route reads `undo`/`listName` to build
// the UndoDescriptor; /api/triage/undo reads `undo` to pick the compensating call.
//   removeListEntry — undo removes the (name-scoped) list entry IF this add was real
//   listOnly        — same list-membership undo; bulk .DelPend is NOT reversed
//   untrash         — undo via untrashMessage (re-adds INBOX)
//   addInbox        — undo re-adds INBOX via batchModify
//   none            — no compensating action (unsub/review)
export const ACTION_DISPATCH = {
  "ok":        { undo: "removeListEntry", listName: "ok" },
  "vip":       { undo: "removeListEntry", listName: "vip" },
  "ok-clean":  { undo: "listOnly",        listName: "ok" },
  "vip-clean": { undo: "listOnly",        listName: "vip" },
  "junk":      { undo: "listOnly",        listName: "blocklist" },
  "unsub":     { undo: "none" },
  "archive":   { undo: "addInbox" },
  "delete":    { undo: "untrash" },
  "review":    { undo: "none" },
};

// Flattens the old flat guard shape into the React API's nested form. A success
// result (anything without guard:true) passes through unchanged.
export function normalizeGuard(result) {
  if (!result || result.guard !== true) return result;
  return { ok: false, guard: { count: result.count, message: result.message } };
}

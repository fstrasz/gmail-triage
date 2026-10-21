// ---------------------------------------------------------------------------
// Types matching the backend API contract exactly
// ---------------------------------------------------------------------------

export type TriageAction =
  | "ok"
  | "vip"
  | "ok-clean"
  | "vip-clean"
  | "junk"
  | "unsub"
  | "archive"
  | "delete"
  | "delete-all"
  | "archive-all"
  | "review";

export type Tier = "..VIP" | "..OK" | null;

export interface TriageEmail {
  id: string;
  threadId: string | null;
  fromEmail: string | null;
  fromName: string | null;
  subject: string;
  snippet: string;
  date: string;
  tier: Tier;
  ruleLabels: string[];
  hasUnsub: boolean;
  unsubUrl: string | null;
  unsubPost: string | null;
}

export interface UndoDescriptor {
  action: TriageAction;
  id: string;
  fromEmail: string | null;
  fromName: string | null;
  addedToList: boolean;
  listName?: "vip" | "ok" | "blocklist";
}

export interface AutoCleanEntry {
  email: string;
  reason: string;
  moved: number;
  latestEmailDate: number;
  subjects: string[];
  ts: number;
}

export type ActionResult =
  | { ok: true; queued: true; jobId: string }
  | {
      ok: false;
      guard: {
        // null when no count was run (guard-off mailbox, Delete/Archive All)
        count: number | null;
        message: string;
        scope?: string;
        action?: string;
        fromName?: string | null;
      };
    }
  | { ok: false; error: "gmail_auth" };

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/** GET /api/triage/queue — returns the triage queue */
export async function getQueue(params: {
  hideListed: boolean;
  limit: number;
}): Promise<{ emails: TriageEmail[]; counts: { left: number } }> {
  const qs = new URLSearchParams({
    hideListed: params.hideListed ? "1" : "0",
    limit: String(params.limit),
  });
  const res = await fetch(`/api/triage/queue?${qs.toString()}`);
  if (!res.ok) throw new Error(`getQueue failed: ${res.status}`);
  return res.json() as Promise<{
    emails: TriageEmail[];
    counts: { left: number };
  }>;
}

/** GET /api/triage/next — returns the next email to triage */
export async function getNext(params?: {
  seen?: string;
  seenIds?: string[];
  hideListed?: boolean;
}): Promise<{ email: TriageEmail | null; autoCleaned: AutoCleanEntry[] }> {
  const qs = new URLSearchParams();
  if (params?.seen != null) qs.set("seen", params.seen);
  if (params?.seenIds != null && params.seenIds.length > 0) {
    qs.set("seenIds", params.seenIds.join(","));
  }
  if (params?.hideListed != null)
    qs.set("hideListed", params.hideListed ? "1" : "0");
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const res = await fetch(`/api/triage/next${suffix}`);
  if (!res.ok) throw new Error(`getNext failed: ${res.status}`);
  return res.json() as Promise<{
    email: TriageEmail | null;
    autoCleaned: AutoCleanEntry[];
  }>;
}

/**
 * Returns a URL string for use as an `<iframe src>`.
 * Does NOT perform a fetch — the browser loads it in the iframe.
 */
export function getBodyUrl(id: string): string {
  return `/api/triage/body?id=${encodeURIComponent(id)}`;
}

/** POST /api/triage/action — perform a triage action on an email */
export async function postAction(payload: {
  id: string;
  action: TriageAction;
  fromEmail: string | null;
  fromName: string | null;
  unsubUrl?: string | null;
  unsubPost?: string | null;
  confirmed?: boolean;
}): Promise<ActionResult> {
  const res = await fetch("/api/triage/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  // 503 with gmail_auth error → return auth-error branch (not throw)
  if (res.status === 503) {
    const body = (await res.json()) as { error?: string };
    if (body.error === "gmail_auth") {
      return { ok: false, error: "gmail_auth" };
    }
  }

  // Other non-2xx → throw so React Query surfaces an error state
  if (!res.ok) {
    throw new Error(`postAction failed: ${res.status}`);
  }

  // 2xx: parse and return — guard responses (ok:false,guard:{...}) are valid 200s
  return res.json() as Promise<ActionResult>;
}

export interface QueueJob {
  id: string;
  action: TriageAction;
  fromEmail: string | null;
  fromName: string | null;
  error: string | null;
}

export interface QueueStatus {
  ok: true;
  actions: number;
  emailsLeft: number;
  counting: number;
  activeIds: string[];
  failed: QueueJob[];
  paused: null | "gmail_auth";
  bulkGuardEnabled: boolean;
}

/** GET /api/queue — action queue status for the counter and failure list */
export async function getQueueStatus(): Promise<QueueStatus> {
  const res = await fetch("/api/queue");
  if (!res.ok) throw new Error(`getQueueStatus failed: ${res.status}`);
  return res.json() as Promise<QueueStatus>;
}

/** POST /api/triage/undo — cancel or reverse a queued action by job id */
export async function postUndo(payload: {
  jobId: string;
}): Promise<{ ok: true; state: "cancelled" | "undo-requested" | "undone" }> {
  const res = await fetch("/api/triage/undo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`postUndo failed: ${res.status}`);
  return res.json() as Promise<{
    ok: true;
    state: "cancelled" | "undo-requested" | "undone";
  }>;
}

async function postJob(id: string, verb: "retry" | "dismiss"): Promise<void> {
  const res = await fetch(`/api/queue/${encodeURIComponent(id)}/${verb}`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`${verb}Job failed: ${res.status}`);
}

/** POST /api/queue/:id/retry */
export const retryJob = (id: string) => postJob(id, "retry");

/** POST /api/queue/:id/dismiss */
export const dismissJob = (id: string) => postJob(id, "dismiss");

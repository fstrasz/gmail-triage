// Typed fetch layer for the Claude Review screen. Mirrors web/src/lib/api.ts
// conventions: relative /api/* URLs, res.json(), throw only on unexpected
// non-2xx. The review action endpoints have no bulk-guard, and the existing
// backend returns 500 (not a 200 ok:false) on failure, so throw-on-!ok is the
// correct surface here.

export type ReviewAction = "keep" | "archive" | "junk";
export type AnalysisAction = ReviewAction | "none";

export interface ReviewEvent {
  title: string;
  date: string | null;
  time: string | null;
  location: string;
  description: string;
  url: string | null;
}

export interface Analysis {
  summary: string;
  action: AnalysisAction;
  actionReason: string;
  isLocalEvent: boolean;
  events: ReviewEvent[];
  draftReply: string | null;
}

export interface ReviewItem {
  id: string;
  subject: string;
  from: string;
  date: string;
  analysis: Analysis;
  status: "pending" | "executed";
  analyzedAt: string;
  executedAction?: ReviewAction;
  executedAt?: string;
  /** Map of stringified event index → created calendar event URL. */
  calendarLinks?: Record<string, string>;
}

/** GET /api/review — the Claude review queue (newest-first as stored). */
export async function getReview(): Promise<ReviewItem[]> {
  const res = await fetch("/api/review");
  if (!res.ok) throw new Error(`getReview failed: ${res.status}`);
  const body = (await res.json()) as { ok: boolean; items?: ReviewItem[] };
  return body.items ?? [];
}

/** POST /api/review/execute — apply the chosen disposition to a review item. */
export async function execute(id: string, action: ReviewAction): Promise<void> {
  const res = await fetch("/api/review/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, action }),
  });
  if (!res.ok) throw new Error(`execute failed: ${res.status}`);
}

/** POST /api/review/calendar — create a calendar event for events[eventIndex]. */
export async function addCalendar(
  id: string,
  eventIndex: number,
  event: ReviewEvent,
): Promise<{ url: string }> {
  const res = await fetch("/api/review/calendar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, eventIndex, event }),
  });
  if (!res.ok) throw new Error(`addCalendar failed: ${res.status}`);
  const body = (await res.json()) as { url: string };
  return { url: body.url };
}

/** POST /api/review/dismiss — drop a review item without acting on the sender. */
export async function dismiss(id: string): Promise<void> {
  const res = await fetch("/api/review/dismiss", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  if (!res.ok) throw new Error(`dismiss failed: ${res.status}`);
}

/**
 * Returns the /api/preview/:id URL for use as an <iframe src>.
 * Does NOT perform a fetch — the browser loads the full HTML doc in the iframe.
 */
export function getBodyUrl(id: string): string {
  return `/api/preview/${encodeURIComponent(id)}`;
}

/** Format an email Date header for display; falls back to the raw string. */
export function formatDate(raw: string): string {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

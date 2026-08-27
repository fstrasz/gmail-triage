// ---------------------------------------------------------------------------
// Lists feature — typed fetch functions + pure view helpers.
// Colocated per the Slice-2/3 per-feature decision (see the design spec):
// each screen owns its <feature>Api.ts rather than extending lib/api.ts.
// Fetch conventions mirror lib/api.ts: relative /api/* URLs, res.json(),
// resolve ok:false auth as data, throw only on unexpected non-2xx.
// ---------------------------------------------------------------------------

// ---- Backend contract types ------------------------------------------------

export type ListName = "vip" | "ok" | "blocklist";
export type ReapplyList = "vip" | "ok" | "blocklist" | "rules";

export interface Entry {
  email: string;
  name: string;
  date: string;
}

export interface BlockEntry {
  email: string;
  name: string;
  reason: string;
  date: string;
}

export interface Rule {
  id: string;
  name: string;
  senders: string[];
  subjects: string[];
  label: string;
  skipInbox: boolean;
  enabled: boolean;
  date: string;
}

export interface Backups {
  single: { backedUpAt: string; count: number } | null;
  named: { n: string; backedUpAt: string; count: number }[];
}

// GET /api/lists returns { ok:true, vip, oklist, blocklist, rules, backups, counts,
// nameFragmentationThreshold }. The OK list is under `oklist` (not `ok`) to avoid
// colliding with the `ok:true` success flag; success itself is 2xx-vs-throw, exactly
// like lib/api.ts getQueue.
export interface ListsResponse {
  vip: Entry[];
  oklist: Entry[];
  blocklist: BlockEntry[];
  rules: Rule[];
  backups: Backups;
  counts: { vip: number; ok: number; blocklist: number };
  // Live-tunable via settings.json (read per check on the backend). Falls back to
  // NAME_FRAGMENTATION_THRESHOLD below when the caller doesn't have a live value yet.
  nameFragmentationThreshold: number;
}

export interface AuthError {
  ok: false;
  error: "gmail_auth";
}

export type OkResult = { ok: true };

// POST /api/lists/add additionally reports whether this add just crossed the
// name-fragmentation threshold (fires on the transition only — see the backend).
export type AddSenderResult = { ok: true; fragmented: boolean };

// ---- Shared fetch helper ---------------------------------------------------

async function postJson<T extends object>(
  url: string,
  body: unknown,
): Promise<T | AuthError> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 503) {
    const b = (await res.json().catch(() => ({}))) as { error?: string };
    if (b.error === "gmail_auth") return { ok: false, error: "gmail_auth" };
  }
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

// ---- Lists read ------------------------------------------------------------

/** GET /api/lists — all three lists + rules + backups. Throws on non-2xx
 * (isError → Reconnect state), matching lib/api.ts getQueue. */
export async function getLists(): Promise<ListsResponse> {
  const res = await fetch("/api/lists");
  if (!res.ok) throw new Error(`getLists failed: ${res.status}`);
  return res.json() as Promise<ListsResponse>;
}

// ---- List mutations --------------------------------------------------------

export function addSender(input: {
  list: ListName;
  email: string;
  name?: string;
  reason?: string;
}): Promise<AddSenderResult | AuthError> {
  return postJson<AddSenderResult>("/api/lists/add", input);
}

export function removeSender(input: {
  list: ListName;
  email: string;
  name?: string;
}): Promise<OkResult | AuthError> {
  return postJson<OkResult>("/api/lists/remove", input);
}

export function resetBlocklist(): Promise<
  { ok: true; backedUp: number } | AuthError
> {
  return postJson<{ ok: true; backedUp: number }>(
    "/api/lists/reset-blocklist",
    {},
  );
}

export function createBackup(): Promise<{ ok: true; n: number } | AuthError> {
  return postJson<{ ok: true; n: number }>("/api/lists/backup", {});
}

// ---- Rule mutations --------------------------------------------------------

export function addRule(input: {
  name?: string;
  senders: string[];
  subjects: string[];
  label: string;
  skipInbox: boolean;
}): Promise<OkResult | AuthError> {
  return postJson<OkResult>("/api/rules/add", input);
}

export function updateRule(input: {
  id: string;
  name?: string;
  senders?: string[];
  subjects?: string[];
  label?: string;
  skipInbox?: boolean;
}): Promise<OkResult | AuthError> {
  return postJson<OkResult>("/api/rules/update", input);
}

export function toggleRule(input: {
  id: string;
}): Promise<{ ok: true; enabled: boolean } | AuthError> {
  return postJson<{ ok: true; enabled: boolean }>("/api/rules/toggle", input);
}

export function deleteRule(input: {
  id: string;
}): Promise<OkResult | AuthError> {
  return postJson<OkResult>("/api/rules/delete", input);
}

// ---- Reapply (SSE + flat guard) --------------------------------------------

export interface ReapplyProgress {
  current: number;
  total: number;
  email?: string;
  error: boolean;
}

export type ReapplyResult =
  | { kind: "guard"; count: number; message: string }
  | {
      kind: "done";
      totalLabeled: number;
      undoable: { list: ReapplyList; count: number } | null;
    }
  | { kind: "error"; error: string };

/**
 * POST /api/reapply. The first (unconfirmed) call returns EITHER a flat-guard
 * JSON 200 (`{ok:false,guard:true,count,message}`), a done JSON when the list
 * is empty/under-threshold, or a `text/event-stream` when it executes. On
 * guard, re-call with `confirmed:true` to read the SSE.
 */
export async function runReapply(
  list: ReapplyList,
  opts: { confirmed?: boolean; onProgress?: (p: ReapplyProgress) => void } = {},
): Promise<ReapplyResult> {
  const res = await fetch("/api/reapply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ list, confirmed: opts.confirmed || undefined }),
  });
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const data = (await res.json()) as {
      ok?: boolean;
      guard?: boolean;
      count?: number;
      message?: string;
      totalLabeled?: number;
      undoable?: { list: ReapplyList; count: number } | null;
      error?: string;
    };
    if (data.guard)
      return {
        kind: "guard",
        count: data.count ?? 0,
        message: data.message ?? "",
      };
    if (data.ok)
      return {
        kind: "done",
        totalLabeled: data.totalLabeled ?? 0,
        undoable: data.undoable ?? null,
      };
    return { kind: "error", error: data.error ?? "unknown" };
  }
  return readReapplyStream(res, opts.onProgress);
}

async function readReapplyStream(
  res: Response,
  onProgress?: (p: ReapplyProgress) => void,
): Promise<ReapplyResult> {
  const reader = res.body?.getReader();
  if (!reader) return { kind: "error", error: "no_stream" };
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const chunk of parts) {
      const line = chunk.replace(/^data: /, "").trim();
      if (!line) continue;
      let msg: {
        type?: string;
        current?: number;
        total?: number;
        email?: string;
        error?: boolean | string;
        totalLabeled?: number;
        undoable?: { list: ReapplyList; count: number } | null;
      };
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      if (msg.type === "progress") {
        onProgress?.({
          current: msg.current ?? 0,
          total: msg.total ?? 0,
          email: msg.email,
          error: Boolean(msg.error),
        });
      } else if (msg.type === "done") {
        return {
          kind: "done",
          totalLabeled: msg.totalLabeled ?? 0,
          undoable: msg.undoable ?? null,
        };
      } else if (msg.type === "error") {
        return {
          kind: "error",
          error: typeof msg.error === "string" ? msg.error : "stream_error",
        };
      }
    }
  }
  return { kind: "error", error: "stream_ended" };
}

export type ReapplyUndoResult =
  | { ok: true; list: ReapplyList; reversed: number; caveat: string | null }
  | { ok: false; error: string };

/** POST /api/reapply/undo — resolves 404/503/200 all as data (never throws). */
export async function reapplyUndo(
  list: ReapplyList,
): Promise<ReapplyUndoResult> {
  const res = await fetch("/api/reapply/undo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ list }),
  });
  return res.json() as Promise<ReapplyUndoResult>;
}

// ---- Pure view helpers (merge / filter / counts) ---------------------------

export interface Membership {
  list: ListName;
  name: string;
  date: string;
  reason?: string;
}

export interface MergedRow {
  email: string;
  memberships: Membership[];
  // At/over the name-fragmentation threshold — distinct display names for this
  // address across its VIP + OK memberships (blocklist excluded; nameless excluded).
  fragmented: boolean;
}

export type Filter = "all" | "blocklist" | "vip" | "ok";

// Mirrors senderList.js's NAME_FRAGMENTATION_THRESHOLD — used only as the fallback
// when a caller doesn't pass the live settings.json-backed value from GET /api/lists.
export const NAME_FRAGMENTATION_THRESHOLD = 3;

/** Merge the three lists into one row per lowercased email, sorted by email.
 * Each list membership is preserved so the row can render name-scoped remove
 * buttons per badge. `nameFragmentationThreshold` should be the live value from
 * ListsResponse; it defaults to NAME_FRAGMENTATION_THRESHOLD for callers that
 * don't have it. */
export function mergeLists(
  data: Pick<ListsResponse, "vip" | "oklist" | "blocklist">,
  nameFragmentationThreshold: number = NAME_FRAGMENTATION_THRESHOLD,
): MergedRow[] {
  const byEmail = new Map<string, MergedRow>();
  const push = (list: ListName, entries: Array<Entry | BlockEntry>) => {
    for (const e of entries) {
      const key = (e.email || "").toLowerCase();
      if (!key) continue;
      let row = byEmail.get(key);
      if (!row) {
        row = { email: key, memberships: [], fragmented: false };
        byEmail.set(key, row);
      }
      row.memberships.push({
        list,
        name: e.name || "",
        date: e.date || "",
        reason: "reason" in e ? e.reason : undefined,
      });
    }
  };
  push("vip", Array.isArray(data.vip) ? data.vip : []);
  push("ok", Array.isArray(data.oklist) ? data.oklist : []);
  push("blocklist", Array.isArray(data.blocklist) ? data.blocklist : []);
  for (const row of byEmail.values()) {
    const names = new Set(
      row.memberships
        .filter((m) => m.list === "vip" || m.list === "ok")
        .map((m) => m.name)
        .filter((n) => n),
    );
    row.fragmented = names.size >= nameFragmentationThreshold;
  }
  return Array.from(byEmail.values()).sort((a, b) =>
    a.email.localeCompare(b.email),
  );
}

export function filterRows(
  rows: MergedRow[],
  filter: Filter,
  search: string,
): MergedRow[] {
  const q = search.trim().toLowerCase();
  return rows.filter((r) => {
    if (filter !== "all" && !r.memberships.some((m) => m.list === filter))
      return false;
    if (
      q &&
      !r.email.includes(q) &&
      !r.memberships.some((m) => m.name.toLowerCase().includes(q))
    )
      return false;
    return true;
  });
}

export function chipCounts(rows: MergedRow[]): Record<Filter, number> {
  return {
    all: rows.length,
    blocklist: rows.filter((r) =>
      r.memberships.some((m) => m.list === "blocklist"),
    ).length,
    vip: rows.filter((r) => r.memberships.some((m) => m.list === "vip")).length,
    ok: rows.filter((r) => r.memberships.some((m) => m.list === "ok")).length,
  };
}

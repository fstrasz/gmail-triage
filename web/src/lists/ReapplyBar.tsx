import { useState } from "react";
import type { GuardInfo } from "../triage/GuardDialog.tsx";
import { GuardDialog } from "../triage/GuardDialog.tsx";
import type { ReapplyList } from "./listsApi.ts";
import { reapplyUndo, runReapply } from "./listsApi.ts";

const LISTS: { list: ReapplyList; label: string }[] = [
  { list: "vip", label: "VIP" },
  { list: "ok", label: "OK" },
  { list: "blocklist", label: "Blocklist" },
  { list: "rules", label: "Rules" },
];

export function ReapplyBar() {
  const [running, setRunning] = useState<ReapplyList | null>(null);
  const [progress, setProgress] = useState("");
  const [message, setMessage] = useState("");
  const [guard, setGuard] = useState<
    (GuardInfo & { list: ReapplyList }) | null
  >(null);
  const [undoInfo, setUndoInfo] = useState<{
    list: ReapplyList;
    count: number;
  } | null>(null);

  async function start(list: ReapplyList, confirmed = false) {
    if (running) return;
    setRunning(list);
    setProgress("Counting…");
    setMessage("");
    setUndoInfo(null);
    const result = await runReapply(list, {
      confirmed,
      onProgress: (p) =>
        setProgress(`${p.current}/${p.total} ${p.email ?? ""}`.trim()),
    });
    setRunning(null);
    setProgress("");
    if (result.kind === "guard") {
      setGuard({ list, count: result.count, message: result.message });
      return;
    }
    if (result.kind === "error") {
      setMessage(`Error: ${result.error}`);
      return;
    }
    setMessage(`${result.totalLabeled} labeled`);
    if (result.undoable) setUndoInfo(result.undoable);
  }

  function confirmGuard() {
    const g = guard;
    setGuard(null);
    if (g) void start(g.list, true);
  }

  async function undo() {
    const info = undoInfo;
    setUndoInfo(null);
    if (!info) return;
    const r = await reapplyUndo(info.list);
    setMessage(
      r.ok
        ? `Undone: ${r.reversed} reversed${r.caveat ? ` — ${r.caveat}` : ""}`
        : `Undo failed: ${r.error}`,
    );
  }

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-hairline p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-ink">Reapply labels</span>
        {LISTS.map(({ list, label }) => (
          <button
            key={list}
            type="button"
            disabled={running !== null}
            onClick={() => void start(list)}
            className="rounded-lg border border-hairline px-3 py-1 text-sm font-medium text-ink disabled:opacity-40"
          >
            {running === list ? progress || "Working…" : label}
          </button>
        ))}
      </div>
      {message && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-3 text-sm text-muted"
        >
          <span>{message}</span>
          {undoInfo && (
            <button
              type="button"
              aria-label="Undo reapply"
              onClick={() => void undo()}
              className="font-semibold text-ink underline underline-offset-2"
            >
              Undo
            </button>
          )}
        </div>
      )}
      <GuardDialog
        guard={guard}
        onConfirm={confirmGuard}
        onCancel={() => setGuard(null)}
      />
    </section>
  );
}

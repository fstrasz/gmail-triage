import { useEffect } from "react";
import type { TriageAction, TriageEmail } from "../lib/api.ts";
import { isUndoable } from "./actionMeta.ts";
import { toastMessage } from "./toastMessage.ts";

export interface ToastInfo {
  /** The queued job the action became; Undo posts its id. */
  undo: { jobId: string; action: TriageAction };
  /** The queue card the action was taken on, shown beside the status. */
  card?: TriageEmail;
}

export function Toast({
  info,
  onUndo,
  onDismiss,
  durationMs = 6000,
}: {
  info: ToastInfo;
  onUndo: (undo: ToastInfo["undo"]) => void;
  onDismiss: () => void;
  durationMs?: number;
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(t);
  }, [info, durationMs, onDismiss]);

  // FIX H3 — only render Undo for actions whose server undo actually does something.
  const undoable = isUndoable(info.undo.action);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-20 z-40 mx-auto flex w-[min(28rem,92vw)] items-center justify-between gap-3 rounded-xl bg-ink px-4 py-3 text-sm text-on-fill shadow-lg"
      style={{ marginBottom: "env(safe-area-inset-bottom)" }}
    >
      <span>{toastMessage(info)}</span>
      {undoable && (
        <button
          type="button"
          aria-label="Undo last action"
          className="rounded-lg px-3 py-1 font-semibold underline underline-offset-2"
          onClick={() => onUndo(info.undo)}
        >
          Undo
        </button>
      )}
    </div>
  );
}

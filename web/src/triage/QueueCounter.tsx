import { X } from "lucide-react";
import { useState } from "react";
import type { QueueJob, QueueStatus } from "../lib/api.ts";
import { ConfirmDialog } from "../settings/ConfirmDialog.tsx";
import { linkAction } from "../shell/ui.ts";
import { ACTION_LABEL } from "./actionMeta.ts";

const n = (v: number) => v.toLocaleString();
const sender = (job: QueueJob) =>
  job.fromName ?? job.fromEmail ?? "unknown sender";

// "3 actions · 1,240 emails left (1 counting) · 1 failed", in the deck header.
// Hidden when nothing is queued and nothing failed.
export function QueueCounter({
  status,
  onRetry,
  onDismiss,
}: {
  status: QueueStatus | undefined;
  onRetry: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  // The failed job whose Dismiss is awaiting confirmation.
  const [dismissing, setDismissing] = useState<QueueJob | null>(null);

  if (!status) return null;
  const { actions, emailsLeft, counting, failed } = status;
  if (actions === 0 && failed.length === 0) return null;

  const line =
    `${n(actions)} ${actions === 1 ? "action" : "actions"} · ${n(emailsLeft)} emails left` +
    (counting > 0 ? ` (${n(counting)} counting)` : "");

  return (
    <div className="tabular flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
      <span>{line}</span>
      {failed.length > 0 && (
        <>
          <span className="font-semibold text-junk">
            · {n(failed.length)} failed
          </span>
          {failed.map((job) => {
            const who = sender(job);
            return (
              <span key={job.id} className="inline-flex items-center gap-1.5">
                <span className="max-w-32 truncate text-graphite">{who}</span>
                <button
                  type="button"
                  aria-label={`Retry ${who}`}
                  className={linkAction}
                  onClick={() => onRetry(job.id)}
                >
                  Retry
                </button>
                <button
                  type="button"
                  aria-label={`Dismiss ${who}`}
                  className="inline-flex items-center rounded text-muted hover:text-ink pointer-coarse:min-h-11 pointer-coarse:px-2"
                  onClick={() => setDismissing(job)}
                >
                  <X aria-hidden size={14} />
                </button>
              </span>
            );
          })}
        </>
      )}
      <ConfirmDialog
        open={dismissing !== null}
        title={
          dismissing
            ? `Dismiss the failed ${ACTION_LABEL[dismissing.action]} for ${sender(dismissing)}?`
            : ""
        }
        message="It will not be retried, and this cannot be undone."
        confirmLabel="Dismiss"
        onConfirm={() => {
          if (dismissing) onDismiss(dismissing.id);
          setDismissing(null);
        }}
        onCancel={() => setDismissing(null)}
      />
    </div>
  );
}

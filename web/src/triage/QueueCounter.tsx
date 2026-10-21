import { X } from "lucide-react";
import type { QueueStatus } from "../lib/api.ts";
import { linkAction } from "../shell/ui.ts";

const n = (v: number) => v.toLocaleString();

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
            const who = job.fromName ?? job.fromEmail ?? "unknown sender";
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
                  onClick={() => onDismiss(job.id)}
                >
                  <X aria-hidden size={14} />
                </button>
              </span>
            );
          })}
        </>
      )}
    </div>
  );
}

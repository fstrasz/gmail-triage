import { useState } from "react";
import { Card } from "../Card.tsx";
import { ConfirmDialog } from "../ConfirmDialog.tsx";
import type { Backups } from "../settingsApi.ts";
import {
  useDeleteNamedBackup,
  useRestoreBlocklistBackup,
  useRestoreNamedBackup,
} from "../settingsQueries.ts";

type Pending =
  | { kind: "restore-single" }
  | { kind: "restore-named"; n: number }
  | { kind: "delete-named"; n: number };

export function BackupsSection({ backups }: { backups: Backups }) {
  const restoreSingle = useRestoreBlocklistBackup();
  const restoreNamed = useRestoreNamedBackup();
  const deleteNamed = useDeleteNamedBackup();

  const [merge, setMerge] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);

  function confirm() {
    if (!pending) return;
    if (pending.kind === "restore-single") restoreSingle.mutate(merge);
    else if (pending.kind === "restore-named")
      restoreNamed.mutate({ n: pending.n, merge });
    else deleteNamed.mutate(pending.n);
    setPending(null);
  }

  const dialogCopy = (() => {
    if (!pending) return { title: "", message: "", confirmLabel: "Confirm" };
    if (pending.kind === "delete-named") {
      return {
        title: "Delete backup",
        message: `Delete named backup #${pending.n}? This cannot be undone.`,
        confirmLabel: "Delete",
      };
    }
    const target =
      pending.kind === "restore-single"
        ? "the auto-backup"
        : `named backup #${pending.n}`;
    return {
      title: "Restore blocklist",
      message: merge
        ? `Merge ${target} into the current blocklist?`
        : `Replace the current blocklist with ${target}? Current entries not in the backup will be lost.`,
      confirmLabel: "Restore",
    };
  })();

  return (
    <Card title="Blocklist Backups">
      <label className="mb-3 flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={merge}
          onChange={(e) => setMerge(e.target.checked)}
        />
        Merge into current (instead of replace)
      </label>

      <div className="mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
          Auto-backup
        </h3>
        {backups.single ? (
          <div className="mt-1 flex items-center justify-between gap-2 text-sm text-ink">
            <span>
              {backups.single.count} entries —{" "}
              {new Date(backups.single.backedUpAt).toLocaleString()}
            </span>
            <button
              type="button"
              className="font-semibold text-ink underline"
              onClick={() => setPending({ kind: "restore-single" })}
            >
              Restore
            </button>
          </div>
        ) : (
          <p className="mt-1 text-sm text-muted">No auto-backup.</p>
        )}
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
          Named backups
        </h3>
        {backups.named.length === 0 ? (
          <p className="mt-1 text-sm text-muted">No named backups.</p>
        ) : (
          <ul className="mt-1 flex flex-col gap-1">
            {backups.named.map((b) => (
              <li
                key={b.n}
                className="flex items-center justify-between gap-2 text-sm text-ink"
              >
                <span>
                  #{b.n} — {b.count} entries —{" "}
                  {new Date(b.backedUpAt).toLocaleString()}
                </span>
                <span className="flex gap-3">
                  <button
                    type="button"
                    className="font-semibold text-ink underline"
                    onClick={() =>
                      setPending({ kind: "restore-named", n: b.n })
                    }
                  >
                    Restore
                  </button>
                  <button
                    type="button"
                    className="text-junk underline"
                    onClick={() => setPending({ kind: "delete-named", n: b.n })}
                  >
                    Delete
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={pending != null}
        title={dialogCopy.title}
        message={dialogCopy.message}
        confirmLabel={dialogCopy.confirmLabel}
        onConfirm={confirm}
        onCancel={() => setPending(null)}
      />
    </Card>
  );
}

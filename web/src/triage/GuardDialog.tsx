import * as Dialog from "@radix-ui/react-dialog";
import {
  btnDanger,
  btnPrimary,
  btnSecondary,
  dialogContent,
  dialogOverlay,
  dialogTitle,
} from "../shell/ui.ts";

export interface GuardInfo {
  count: number;
  message: string;
  /** What the count covers — reach + name scope (search-scope visibility). */
  scope?: string;
  /** Set for sender-wide actions: "delete-all" | "archive-all". */
  action?: string;
  fromName?: string | null;
}

export function GuardDialog({
  guard,
  onConfirm,
  onCancel,
}: {
  guard: GuardInfo | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const who = guard?.fromName ?? "this sender";
  const isDelete = guard?.action === "delete-all";
  const isArchive = guard?.action === "archive-all";
  const title = isDelete
    ? `Delete all mail from ${who}?`
    : isArchive
      ? `Archive all mail from ${who}?`
      : "Confirm bulk action";
  const confirmLabel = isDelete
    ? `Move ${guard?.count} to Trash`
    : isArchive
      ? `Archive ${guard?.count}`
      : "Confirm";
  const confirmCls = isArchive ? btnPrimary : btnDanger;
  return (
    <Dialog.Root
      open={guard != null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={dialogOverlay} />
        <Dialog.Content className={dialogContent}>
          <Dialog.Title className={dialogTitle}>{title}</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-ink">
            {guard?.message}
          </Dialog.Description>
          {guard?.scope && (
            <p className="mt-2 inline-block rounded-md bg-sunk px-2 py-1 text-xs font-medium text-graphite">
              {guard.scope}
            </p>
          )}
          {isDelete && (
            <p className="mt-2 text-sm text-ink">
              They go to Gmail Trash and can be recovered for 30 days.
            </p>
          )}
          {isArchive && (
            <p className="mt-2 text-sm text-ink">
              They stay in All Mail. Unread mail stays unread.
            </p>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <button type="button" className={btnSecondary}>
                Cancel
              </button>
            </Dialog.Close>
            <button type="button" className={confirmCls} onClick={onConfirm}>
              {confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

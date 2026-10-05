import * as Dialog from "@radix-ui/react-dialog";

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
  const confirmBg = isArchive ? "bg-ink" : "bg-junk";
  return (
    <Dialog.Root
      open={guard != null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(26rem,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-5 shadow-xl">
          <Dialog.Title className="text-base font-semibold text-ink">
            {title}
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-ink">
            {guard?.message}
          </Dialog.Description>
          {guard?.scope && (
            <p className="mt-1 text-xs text-muted">{guard.scope}</p>
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
              <button
                type="button"
                className="rounded-lg border border-hairline px-4 py-2 text-sm font-medium text-ink"
              >
                Cancel
              </button>
            </Dialog.Close>
            <button
              type="button"
              className={`rounded-lg ${confirmBg} px-4 py-2 text-sm font-semibold text-white`}
              onClick={onConfirm}
            >
              {confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

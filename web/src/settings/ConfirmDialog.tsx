import * as Dialog from "@radix-ui/react-dialog";
import {
  btnDanger,
  btnSecondary,
  dialogContent,
  dialogOverlay,
  dialogTitle,
} from "../shell/ui.ts";

// A small confirm dialog modeled on triage/GuardDialog.tsx (Radix). Used for the
// destructive backup-restore / delete confirms in the Backups section.
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) onCancel();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={dialogOverlay} />
        <Dialog.Content className={dialogContent}>
          <Dialog.Title className={dialogTitle}>{title}</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-graphite">
            {message}
          </Dialog.Description>
          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <button type="button" className={btnSecondary}>
                Cancel
              </button>
            </Dialog.Close>
            <button type="button" className={btnDanger} onClick={onConfirm}>
              {confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

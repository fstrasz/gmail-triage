import * as Dialog from "@radix-ui/react-dialog";
import type { TriageEmail } from "../lib/api.ts";
import {
  btnDanger,
  btnDangerOutline,
  btnSecondary,
  dialogContent,
  dialogOverlay,
  dialogTitle,
} from "../shell/ui.ts";

// Touch Delete asks how far to reach: this message, or everything from the
// sender. Both go to Trash.
export function DeleteChoiceDialog({
  card,
  onChoose,
  onCancel,
}: {
  card: TriageEmail | null;
  onChoose: (action: "delete" | "delete-all") => void;
  onCancel: () => void;
}) {
  const who = card?.fromName ?? card?.fromEmail ?? "this sender";
  return (
    <Dialog.Root
      open={card != null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={dialogOverlay} />
        <Dialog.Content className={dialogContent}>
          <Dialog.Title className={dialogTitle}>Delete</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-ink">
            Delete this message, or all mail from {who}? Deleted mail goes to
            Gmail Trash and can be recovered for 30 days.
          </Dialog.Description>
          <div className="mt-5 flex flex-col gap-2">
            <button
              type="button"
              className={btnDanger}
              onClick={() => onChoose("delete")}
            >
              Delete this
            </button>
            <button
              type="button"
              className={btnDangerOutline}
              onClick={() => onChoose("delete-all")}
            >
              Delete all from {who}
            </button>
            <Dialog.Close asChild>
              <button type="button" className={btnSecondary}>
                Cancel
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

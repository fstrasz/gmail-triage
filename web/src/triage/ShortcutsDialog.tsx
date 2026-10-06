import * as Dialog from "@radix-ui/react-dialog";
import {
  btnSecondary,
  dialogContent,
  dialogOverlay,
  dialogTitle,
  kbd,
} from "../shell/ui.ts";
import { ACTION_LABEL, DIR_ARROW } from "./actionMeta.ts";
import type { Dir, Mode } from "./swipeMap.ts";
import { swipeAction } from "./swipeMap.ts";

// Letter shortcuts (desktop). Single source for the key handler, the column
// hints and this dialog.
export const ACTION_KEY = {
  archive: "e",
  delete: "#",
  junk: "!",
  vip: "v",
  ok: "o",
  review: "r",
} as const;

const DIRS: Dir[] = ["right", "left", "up", "down"];

export function ShortcutsDialog({
  open,
  onOpenChange,
  mode,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: Mode;
}) {
  const rows: [string, string][] = [
    ["j / k", "Next / previous in the queue (select only)"],
    ...(Object.entries(ACTION_KEY) as [keyof typeof ACTION_KEY, string][]).map(
      ([a, k]): [string, string] => [k.toUpperCase(), ACTION_LABEL[a]],
    ),
    ["U", "Undo the last action"],
    ["?", "Show this list"],
    ...DIRS.map((d): [string, string] => [
      DIR_ARROW[d],
      ACTION_LABEL[swipeAction(mode, d)],
    ]),
  ];
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={dialogOverlay} />
        <Dialog.Content className={dialogContent}>
          <Dialog.Title className={dialogTitle}>
            Keyboard shortcuts
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-muted">
            Sender-wide and Clean actions have no shortcut — use the buttons.
          </Dialog.Description>
          <dl className="mt-4 grid grid-cols-[4.5rem_1fr] items-center gap-x-3 gap-y-1.5 text-sm">
            {rows.map(([k, label]) => (
              <div key={`${k}-${label}`} className="contents">
                <dt>
                  <kbd className={kbd}>{k}</kbd>
                </dt>
                <dd className="text-graphite">{label}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-5 flex justify-end">
            <Dialog.Close asChild>
              <button type="button" className={btnSecondary}>
                Close
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

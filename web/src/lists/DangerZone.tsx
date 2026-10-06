import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import {
  btnDanger,
  btnSecondary,
  dialogOverlay,
  dialogTitle,
} from "../shell/ui.ts";
import type { Backups } from "./listsApi.ts";
import { useCreateBackup, useResetBlocklist } from "./listsQueries.ts";

export function DangerZone({ backups }: { backups: Backups }) {
  const reset = useResetBlocklist();
  const createBackup = useCreateBackup();
  const [confirm, setConfirm] = useState("");
  const [open, setOpen] = useState(false);

  function doReset() {
    reset.mutate(undefined, {
      onSuccess: () => {
        setOpen(false);
        setConfirm("");
      },
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-junk/40 bg-paper p-3">
      <span className="text-sm font-semibold text-junk">Danger Zone</span>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => createBackup.mutate()}
          disabled={createBackup.isPending}
          className={btnSecondary}
        >
          Create Backup
        </button>
        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Trigger asChild>
            <button type="button" className={btnDanger}>
              Reset Blocklist
            </button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className={dialogOverlay} />
            <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-rule bg-paper p-5 text-ink shadow-float">
              <Dialog.Title className={dialogTitle}>
                Reset the blocklist?
              </Dialog.Title>
              <Dialog.Description className="mt-2 text-sm text-muted">
                This clears every blocklist entry (an automatic backup is taken
                first). Type RESET to confirm.
              </Dialog.Description>
              <input
                aria-label="Type RESET to confirm"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="mt-3 w-full rounded-lg border border-hairline px-3 py-2 text-sm"
              />
              <div className="mt-5 flex justify-end gap-2">
                <Dialog.Close asChild>
                  <button type="button" className={btnSecondary}>
                    Cancel
                  </button>
                </Dialog.Close>
                <button
                  type="button"
                  disabled={confirm !== "RESET" || reset.isPending}
                  onClick={doReset}
                  className={btnDanger}
                >
                  Reset
                </button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
      <p className="text-xs text-muted">
        {backups.single
          ? `Last backup: ${backups.single.count} entries`
          : "No single backup yet."}
        {backups.named.length > 0 &&
          ` · ${backups.named.length} named backup(s)`}
      </p>
    </section>
  );
}

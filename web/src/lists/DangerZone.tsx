import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import type { Backups } from './listsApi.ts'
import { useResetBlocklist, useCreateBackup } from './listsQueries.ts'

export function DangerZone({ backups }: { backups: Backups }) {
  const reset = useResetBlocklist()
  const createBackup = useCreateBackup()
  const [confirm, setConfirm] = useState('')
  const [open, setOpen] = useState(false)

  function doReset() {
    reset.mutate(undefined, {
      onSuccess: () => {
        setOpen(false)
        setConfirm('')
      },
    })
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-junk/40 p-3">
      <span className="text-sm font-semibold text-junk">Danger Zone</span>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => createBackup.mutate()}
          disabled={createBackup.isPending}
          className="rounded-lg border border-hairline px-3 py-1 text-sm font-medium text-ink disabled:opacity-40"
        >
          Create Backup
        </button>
        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Trigger asChild>
            <button type="button" className="rounded-lg bg-junk px-3 py-1 text-sm font-semibold text-white">
              Reset Blocklist
            </button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
            <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(26rem,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-5 shadow-xl">
              <Dialog.Title className="text-base font-semibold text-ink">Reset the blocklist?</Dialog.Title>
              <Dialog.Description className="mt-2 text-sm text-muted">
                This clears every blocklist entry (an automatic backup is taken first). Type RESET to confirm.
              </Dialog.Description>
              <input
                aria-label="Type RESET to confirm"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="mt-3 w-full rounded-lg border border-hairline px-3 py-2 text-sm"
              />
              <div className="mt-5 flex justify-end gap-2">
                <Dialog.Close asChild>
                  <button type="button" className="rounded-lg border border-hairline px-4 py-2 text-sm font-medium text-ink">
                    Cancel
                  </button>
                </Dialog.Close>
                <button
                  type="button"
                  disabled={confirm !== 'RESET' || reset.isPending}
                  onClick={doReset}
                  className="rounded-lg bg-junk px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                >
                  Reset
                </button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
      <p className="text-xs text-muted">
        {backups.single ? `Last backup: ${backups.single.count} entries` : 'No single backup yet.'}
        {backups.named.length > 0 && ` · ${backups.named.length} named backup(s)`}
      </p>
    </section>
  )
}

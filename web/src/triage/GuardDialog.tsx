import * as Dialog from '@radix-ui/react-dialog'

export interface GuardInfo {
  count: number
  message: string
}

export function GuardDialog({
  guard,
  onConfirm,
  onCancel,
}: {
  guard: GuardInfo | null
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Dialog.Root open={guard != null} onOpenChange={(open) => { if (!open) onCancel() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(26rem,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-5 shadow-xl">
          <Dialog.Title className="text-base font-semibold text-ink">Confirm bulk action</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-muted">
            {guard?.message}
          </Dialog.Description>
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
              className="rounded-lg bg-junk px-4 py-2 text-sm font-semibold text-white"
              onClick={onConfirm}
            >
              Confirm
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

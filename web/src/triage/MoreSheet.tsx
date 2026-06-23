import * as Dialog from '@radix-ui/react-dialog'
import type { TriageAction } from '../lib/api.ts'
import { ACTION_LABEL, ACTION_COLOR } from './actionMeta.ts'

// The full overflow sheet. Holds every action NOT in the primary button row,
// so button-row ∪ More = all nine actions (DECK-3). Each row is a labeled
// menuitem reachable without a gesture, on every breakpoint.
export function MoreSheet({
  actions,
  open,
  onOpenChange,
  onPick,
}: {
  actions: TriageAction[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (action: TriageAction) => void
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          aria-label="More actions"
          className="fixed inset-x-0 bottom-0 z-50 mx-auto w-[min(28rem,100vw)] rounded-t-2xl bg-white p-3 shadow-xl"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
        >
          <Dialog.Title className="px-2 pb-2 pt-1 text-sm font-semibold text-muted">More actions</Dialog.Title>
          <Dialog.Description className="sr-only">All remaining triage actions for the top card.</Dialog.Description>
          <div role="menu" className="flex flex-col">
            {actions.map((a) => (
              <button
                key={a}
                type="button"
                role="menuitem"
                aria-label={ACTION_LABEL[a]}
                className={`flex items-center justify-between rounded-lg px-3 py-3 text-left text-base font-medium ${ACTION_COLOR[a]} hover:bg-hairline`}
                onClick={() => {
                  onPick(a)
                  onOpenChange(false)
                }}
              >
                {ACTION_LABEL[a]}
              </button>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

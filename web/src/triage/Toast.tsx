import { useEffect } from 'react'
import type { TriageAction, UndoDescriptor } from '../lib/api.ts'
import { isUndoable } from './actionMeta.ts'

export interface ToastInfo {
  undo: UndoDescriptor
  /** Number of messages the bulk action archived (for honest copy). */
  labeled?: number
}

// Bulk actions .DelPend many messages and return only a count; undo reverses
// list membership only (FIX H3 — never claim a full undo we can't honor).
const BULK_ACTIONS: ReadonlySet<TriageAction> = new Set<TriageAction>(['ok-clean', 'vip-clean', 'junk'])

const ACTION_VERB: Record<TriageAction, string> = {
  ok: 'Marked OK',
  vip: 'Marked VIP',
  'ok-clean': 'OK & Clean',
  'vip-clean': 'VIP & Clean',
  junk: 'Junked',
  unsub: 'Unsubscribed',
  archive: 'Archived',
  delete: 'Deleted',
  review: 'Queued for review',
}

function toastMessage(info: ToastInfo): string {
  const { action } = info.undo
  if (BULK_ACTIONS.has(action)) {
    const n = info.labeled ?? 0
    // Honest bulk copy: list-membership reverses, the bulk archive does not.
    return `Listed removed — ${n} stay archived`
  }
  // FIX H3 — unsub/review have a no-op server undo; never promise undo for them.
  if (!isUndoable(action)) {
    if (action === 'unsub') return 'Unsubscribed — sender blocklisted (not reversible here)'
    return 'Queued for review'
  }
  return `${ACTION_VERB[action]} — undo available`
}

export function Toast({
  info,
  onUndo,
  onDismiss,
  durationMs = 6000,
}: {
  info: ToastInfo
  onUndo: (descriptor: UndoDescriptor) => void
  onDismiss: () => void
  durationMs?: number
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, durationMs)
    return () => clearTimeout(t)
  }, [info, durationMs, onDismiss])

  // FIX H3 — only render Undo for actions whose server undo actually does something.
  const undoable = isUndoable(info.undo.action)

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-20 z-40 mx-auto flex w-[min(28rem,92vw)] items-center justify-between gap-3 rounded-xl bg-ink px-4 py-3 text-sm text-white shadow-lg"
      style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
    >
      <span>{toastMessage(info)}</span>
      {undoable && (
        <button
          type="button"
          aria-label="Undo last action"
          className="rounded-lg px-3 py-1 font-semibold underline underline-offset-2"
          onClick={() => onUndo(info.undo)}
        >
          Undo
        </button>
      )}
    </div>
  )
}

import type { TriageAction } from '../lib/api.ts'
import { isUndoable } from './actionMeta.ts'
import type { ToastInfo } from './Toast.tsx'

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

export function toastMessage(info: ToastInfo): string {
  const { action } = info.undo
  if (BULK_ACTIONS.has(action)) {
    const n = info.labeled ?? 0
    return `Listed removed — ${n} stay archived`
  }
  if (!isUndoable(action)) {
    if (action === 'unsub') return 'Unsubscribed — sender blocklisted (not reversible here)'
    return 'Queued for review'
  }
  return `${ACTION_VERB[action]} — undo available`
}

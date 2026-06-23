import type { TriageAction } from '../lib/api.ts'
import type { Dir } from './swipeMap.ts'

// Human label + semantic color token per action. The label is the accessible
// name for every button/menu-item (DECK-3) so a control with each action's
// name is findable by screen reader / test.
export const ACTION_LABEL: Record<TriageAction, string> = {
  ok: 'OK',
  vip: 'VIP',
  'ok-clean': 'OK & Clean',
  'vip-clean': 'VIP & Clean',
  junk: 'Junk',
  unsub: 'Unsub',
  archive: 'Archive',
  delete: 'Delete',
  review: 'Review',
}

// Tailwind text-color utility token per action (references semantic tokens).
export const ACTION_COLOR: Record<TriageAction, string> = {
  ok: 'text-ok',
  vip: 'text-vip',
  'ok-clean': 'text-ok',
  'vip-clean': 'text-vip',
  junk: 'text-junk',
  unsub: 'text-muted',
  archive: 'text-ink',
  delete: 'text-junk',
  review: 'text-review',
}

export const DIR_ARROW: Record<Dir, string> = {
  right: '→',
  left: '←',
  up: '↑',
  down: '↓',
}

// Single source of truth for undoability, mirroring the backend
// ACTION_DISPATCH[...].undo === 'none' (app/lib/triageApi.js). unsub/review have
// no compensating server call, so the UI must NOT promise undo for them (FIX H3).
// Everything else (ok/vip/archive/delete reversible; ok-clean/vip-clean/junk
// reverse list membership only) IS undoable.
const NON_UNDOABLE: ReadonlySet<TriageAction> = new Set<TriageAction>(['unsub', 'review'])

export function isUndoable(action: TriageAction): boolean {
  return !NON_UNDOABLE.has(action)
}

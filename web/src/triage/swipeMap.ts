import type { TriageAction } from '../lib/api.ts'

export type Mode = 'hidden' | 'shown'
export type Dir = 'left' | 'right' | 'up' | 'down'

// All nine actions in canonical order (order matters for MORE derivation)
export const ALL9: readonly TriageAction[] = [
  'ok', 'vip', 'ok-clean', 'vip-clean', 'junk', 'unsub', 'archive', 'delete', 'review',
]

// Swipe gestures per mode
const SWIPE_MAP: Record<Mode, Record<Dir, TriageAction>> = {
  hidden: { right: 'ok-clean', left: 'junk', up: 'vip', down: 'delete' },
  shown:  { right: 'archive',  left: 'junk', up: 'ok',  down: 'review' },
}

export function swipeAction(mode: Mode, dir: Dir): TriageAction {
  return SWIPE_MAP[mode][dir]
}

// Primary buttons visible per mode (3 each)
export const BUTTONS: Record<Mode, TriageAction[]> = {
  hidden: ['vip-clean', 'archive', 'unsub'],
  shown:  ['vip', 'vip-clean', 'unsub'],
}

// Full overflow = every action NOT in BUTTONS[mode].
// Derived structurally so buttons ∪ MORE = ALL9 by construction (DECK-3).
export const MORE: Record<Mode, TriageAction[]> = {
  hidden: ALL9.filter(a => !BUTTONS.hidden.includes(a)),
  shown:  ALL9.filter(a => !BUTTONS.shown.includes(a)),
}

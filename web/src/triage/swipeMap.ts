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
  hidden: ['ok', 'archive', 'review'],   // operator-chosen tap row; swipes cover OK&Clean/Junk/VIP/Delete
  shown:  ['vip', 'vip-clean', 'unsub'],
}

// Actions reachable by a swipe gesture in a given mode (the four directions).
const swipeCovered = (m: Mode): TriageAction[] =>
  (['left', 'right', 'up', 'down'] as Dir[]).map(d => SWIPE_MAP[m][d])

// MORE = the `⋯` overflow tap menu.
//  - hidden: ONLY actions not already covered by a button OR a swipe (VIP & Clean,
//    Unsub) — the menu never duplicates a gesture, so it stays a lean 2 items.
//  - shown: unchanged — full overflow of everything not in the button row.
// Every action stays reachable via button ∪ swipe ∪ MORE in each mode (DECK-3).
export const MORE: Record<Mode, TriageAction[]> = {
  hidden: ALL9.filter(a => !BUTTONS.hidden.includes(a) && !swipeCovered('hidden').includes(a)),
  shown:  ALL9.filter(a => !BUTTONS.shown.includes(a)),
}

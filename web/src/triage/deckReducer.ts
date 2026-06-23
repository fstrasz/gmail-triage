import type { TriageEmail, TriageAction } from '../lib/api.ts'
import type { Mode } from './swipeMap.ts'

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface DeckState {
  cards: TriageEmail[]
  removed: TriageEmail[]
  mode: Mode
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export type DeckEvent =
  | { type: 'load'; cards: TriageEmail[] }
  | { type: 'setMode'; mode: Mode }
  | { type: 'act'; action: TriageAction }
  | { type: 'advance' }
  | { type: 'undo' }

// ---------------------------------------------------------------------------
// Reducer — pure, immutable
// ---------------------------------------------------------------------------

export function deckReducer(state: DeckState, event: DeckEvent): DeckState {
  switch (event.type) {
    case 'load': {
      // Reconcile incoming server data with local optimistic state instead of
      // clobbering it. The React Query cache mutates on every optimistic action
      // (useAction.onMutate) which re-fires the load effect mid-action; a plain
      // replace-and-clear would wipe `removed[]` and turn a subsequent `undo`
      // (the guard/auth revert) into a no-op, losing the just-acted card.
      //
      // Rules:
      //  - A `removed` card whose id is back in the incoming queue was restored
      //    server-side (e.g. an undo refetch) — drop it from `removed` and let
      //    it reappear in the visible deck.
      //  - A `removed` card still absent from the incoming queue is an in-flight
      //    or confirmed optimistic removal — keep it in `removed` and filtered
      //    out of the visible deck.
      const incomingIds = new Set(event.cards.map((c) => c.id))
      const removed = state.removed.filter((c) => !incomingIds.has(c.id))
      const removedIds = new Set(removed.map((c) => c.id))
      const cards = event.cards.filter((c) => !removedIds.has(c.id))
      return { ...state, cards, removed }
    }

    case 'setMode':
      return { ...state, mode: event.mode }

    case 'act':
    case 'advance': {
      if (state.cards.length === 0) return state
      const [top, ...rest] = state.cards
      return { ...state, cards: rest, removed: [top, ...state.removed] }
    }

    case 'undo': {
      if (state.removed.length === 0) return state
      const [last, ...remaining] = state.removed
      return { ...state, cards: [last, ...state.cards], removed: remaining }
    }
  }
}

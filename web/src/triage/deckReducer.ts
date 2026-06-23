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
    case 'load':
      return { ...state, cards: event.cards, removed: [] }

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

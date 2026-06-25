import type { TriageEmail, TriageAction } from '../lib/api.ts'
import type { Mode } from './swipeMap.ts'

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface DeckState {
  cards: TriageEmail[]
  // Optimistically removed cards, newest first, each with the index it held —
  // so `undo` restores it to its original position (not just the top).
  removed: { card: TriageEmail; index: number }[]
  mode: Mode
  // The "active" card (highlighted in the queue / shown in the preview). null
  // when the deck is empty. Acting/clicking selects in place; the queue does
  // NOT reorder.
  selectedId: string | null
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export type DeckEvent =
  | { type: 'load'; cards: TriageEmail[] }
  | { type: 'setMode'; mode: Mode }
  | { type: 'select'; id: string }
  | { type: 'act'; action: TriageAction; id?: string }
  | { type: 'advance'; id?: string }
  | { type: 'undo' }

// The id to act on: an explicit id, else the current selection, else the top.
function activeId(state: DeckState, explicit?: string): string | null {
  if (explicit) return explicit
  if (state.selectedId && state.cards.some((c) => c.id === state.selectedId)) return state.selectedId
  return state.cards[0]?.id ?? null
}

// ---------------------------------------------------------------------------
// Reducer — pure, immutable
// ---------------------------------------------------------------------------

export function deckReducer(state: DeckState, event: DeckEvent): DeckState {
  switch (event.type) {
    case 'load': {
      // Reconcile incoming server data with local optimistic state instead of
      // clobbering it (the React Query cache mutates on every optimistic action,
      // re-firing the load effect mid-action). A `removed` card back in the
      // incoming queue was restored server-side → drop it from `removed`; one
      // still absent is an in-flight/confirmed removal → keep it filtered out.
      const incomingIds = new Set(event.cards.map((c) => c.id))
      const removed = state.removed.filter((r) => !incomingIds.has(r.card.id))
      const removedIds = new Set(removed.map((r) => r.card.id))
      const cards = event.cards.filter((c) => !removedIds.has(c.id))
      // Keep the selection if it's still present, else fall back to the top.
      const selectedId =
        state.selectedId && cards.some((c) => c.id === state.selectedId)
          ? state.selectedId
          : (cards[0]?.id ?? null)
      return { ...state, cards, removed, selectedId }
    }

    case 'setMode':
      return { ...state, mode: event.mode }

    case 'select':
      return state.cards.some((c) => c.id === event.id) ? { ...state, selectedId: event.id } : state

    case 'act':
    case 'advance': {
      const id = activeId(state, event.id)
      if (id == null) return state
      const index = state.cards.findIndex((c) => c.id === id)
      if (index < 0) return state
      const card = state.cards[index]
      const cards = [...state.cards.slice(0, index), ...state.cards.slice(index + 1)]
      // Keep the cursor at the same position — the card that shifts up into the
      // gap becomes selected (the queue "moves up"); clamp at the end.
      const nextSelected = cards.length ? cards[Math.min(index, cards.length - 1)].id : null
      return { ...state, cards, removed: [{ card, index }, ...state.removed], selectedId: nextSelected }
    }

    case 'undo': {
      if (state.removed.length === 0) return state
      const [{ card, index }, ...remaining] = state.removed
      const cards = [...state.cards.slice(0, index), card, ...state.cards.slice(index)]
      // Re-select the restored card so the deck returns exactly to its prior state.
      return { ...state, cards, removed: remaining, selectedId: card.id }
    }
  }
}

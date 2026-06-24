import { test, expect, describe } from 'vitest'
import { swipeAction, BUTTONS, MORE } from '../triage/swipeMap.ts'
import { deckReducer } from '../triage/deckReducer.ts'
import type { TriageEmail } from '../lib/api.ts'

// ---------------------------------------------------------------------------
// swipeMap — verbatim from task brief
// ---------------------------------------------------------------------------

const ALL9 = ['ok','vip','ok-clean','vip-clean','junk','unsub','archive','delete','review']

test('hidden', () => {
  expect(swipeAction('hidden','right')).toBe('ok-clean')
  expect(swipeAction('hidden','left')).toBe('junk')
  expect(swipeAction('hidden','up')).toBe('vip')
  expect(swipeAction('hidden','down')).toBe('delete')
  // Operator-chosen tap row; ⋯ holds only the actions no button/swipe covers.
  expect(BUTTONS.hidden).toEqual(['ok','archive','review'])
  expect(MORE.hidden).toEqual(['vip-clean','unsub'])
})

test('shown', () => {
  expect(swipeAction('shown','right')).toBe('archive')
  expect(swipeAction('shown','left')).toBe('junk')
  expect(swipeAction('shown','up')).toBe('ok')
  expect(swipeAction('shown','down')).toBe('review')
  expect(BUTTONS.shown).toEqual(['vip','vip-clean','unsub'])
  expect(MORE.shown).toEqual(['ok','ok-clean','junk','archive','delete','review'])
})

test('a11y parity: every action reachable via button ∪ swipe ∪ More (DECK-3)', () => {
  for (const m of ['hidden','shown'] as const) {
    const swipes = (['left','right','up','down'] as const).map(d => swipeAction(m,d))
    expect(new Set([...BUTTONS[m], ...swipes, ...MORE[m]])).toEqual(new Set(ALL9))
  }
})

test('hidden ⋯ is lean: exactly the 2 actions no button or swipe covers', () => {
  const swipes = (['left','right','up','down'] as const).map(d => swipeAction('hidden',d))
  expect(MORE.hidden).toEqual(['vip-clean','unsub'])
  for (const a of MORE.hidden) {
    expect(BUTTONS.hidden).not.toContain(a)
    expect(swipes).not.toContain(a)
  }
})

// ---------------------------------------------------------------------------
// deckReducer
// ---------------------------------------------------------------------------

function makeEmail(id: string): TriageEmail {
  return {
    id,
    threadId: null,
    fromEmail: `${id}@example.com`,
    fromName: id,
    subject: `Subject ${id}`,
    snippet: '',
    date: '2026-01-01',
    tier: null,
    ruleLabels: [],
    hasUnsub: false,
    unsubUrl: null,
    unsubPost: null,
  }
}

const e1 = makeEmail('e1')
const e2 = makeEmail('e2')
const e3 = makeEmail('e3')

describe('deckReducer', () => {
  test('load initialises cards and resets removed stack', () => {
    const state = deckReducer(
      { cards: [], removed: [], mode: 'hidden' },
      { type: 'load', cards: [e1, e2, e3] }
    )
    expect(state.cards).toEqual([e1, e2, e3])
    expect(state.removed).toEqual([])
    expect(state.mode).toBe('hidden')
  })

  test('act removes the top card and pushes it onto removed[]', () => {
    const init = { cards: [e1, e2, e3], removed: [], mode: 'hidden' as const }
    const state = deckReducer(init, { type: 'act', action: 'ok' as const })
    expect(state.cards).toEqual([e2, e3])
    expect(state.removed).toEqual([e1])
  })

  test('advance removes the top card (no action stored) and pushes it onto removed[]', () => {
    const init = { cards: [e1, e2, e3], removed: [], mode: 'hidden' as const }
    const state = deckReducer(init, { type: 'advance' })
    expect(state.cards).toEqual([e2, e3])
    expect(state.removed).toEqual([e1])
  })

  test('undo pops removed[] and restores the card to the top', () => {
    const init = { cards: [e2, e3], removed: [e1], mode: 'hidden' as const }
    const state = deckReducer(init, { type: 'undo' })
    expect(state.cards[0]).toEqual(e1)
    expect(state.cards).toEqual([e1, e2, e3])
    expect(state.removed).toEqual([])
  })

  test('undo is a no-op when removed[] is empty', () => {
    const init = { cards: [e1, e2], removed: [], mode: 'hidden' as const }
    const state = deckReducer(init, { type: 'undo' })
    expect(state).toEqual(init)
  })

  test('act on empty queue leaves queue empty and pushes to removed[]', () => {
    const init = { cards: [e1], removed: [], mode: 'hidden' as const }
    const state = deckReducer(init, { type: 'act', action: 'vip' as const })
    expect(state.cards).toEqual([])
    expect(state.removed).toEqual([e1])
  })

  test('setMode switches mode and leaves cards/removed unchanged', () => {
    const init = { cards: [e1, e2], removed: [e3], mode: 'hidden' as const }
    const state = deckReducer(init, { type: 'setMode', mode: 'shown' })
    expect(state.mode).toBe('shown')
    expect(state.cards).toEqual(init.cards)
    expect(state.removed).toEqual(init.removed)
  })

  // NOTE: `load` no longer replace-and-clears. It RECONCILES incoming server
  // data with the local optimistic `removed[]` stack so a load firing mid-action
  // (React Query's onMutate cache filter re-fires the load effect) can't strand
  // the just-acted card. A removed card whose id is back in the incoming queue
  // was restored server-side → dropped from removed and shown; a removed card
  // still absent from incoming stays optimistically removed.
  test('load reconciles: drops removed cards that reappear in incoming, keeps those still absent', () => {
    const init = { cards: [e1], removed: [e2, e3], mode: 'shown' as const }
    const state = deckReducer(init, { type: 'load', cards: [e3] })
    // e3 is back in the incoming queue → no longer optimistically removed.
    // e2 is still absent from incoming → stays removed and filtered from cards.
    expect(state.cards).toEqual([e3])
    expect(state.removed).toEqual([e2])
  })

  test('load preserves removed[] when the acted card is absent from incoming (in-flight removal)', () => {
    // Coordinated flow: useAction.onMutate filters the acted card (e1) from the
    // cache at the same time the deck `act` pushes it to removed[]. The load
    // effect fires from that cache change with incoming = [e2]. e1 must stay
    // removed (a no-op reconcile), NOT reappear — this is the load-mid-action
    // case that previously clobbered removed[] and stranded the card.
    const init = { cards: [e2], removed: [e1], mode: 'hidden' as const }
    const state = deckReducer(init, { type: 'load', cards: [e2] })
    expect(state.cards).toEqual([e2])
    expect(state.removed).toEqual([e1])
  })

  test('reducer is immutable — original state untouched after act', () => {
    const init = { cards: [e1, e2], removed: [], mode: 'hidden' as const }
    const origCards = init.cards
    deckReducer(init, { type: 'act', action: 'archive' as const })
    expect(init.cards).toBe(origCards)
    expect(init.cards.length).toBe(2)
  })
})

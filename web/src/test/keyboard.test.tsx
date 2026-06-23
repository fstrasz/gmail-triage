import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import type { TriageEmail, ActionResult, UndoDescriptor } from '../lib/api.ts'

// ---------------------------------------------------------------------------
// Mock ../lib/queries.ts — same pattern as deckui.test.tsx.
// We expose controllable isPending so we can test the single-in-flight guard.
// ---------------------------------------------------------------------------

interface QueueState {
  data: { emails: TriageEmail[]; counts: { left: number } } | undefined
  isPending: boolean
  isError: boolean
}

const hookState: {
  queue: QueueState
  actionResult: ActionResult
  actionIsPending: boolean
} = {
  queue: { data: undefined, isPending: false, isError: false },
  actionResult: { ok: true, undo: stubUndo('ok-clean') },
  actionIsPending: false,
}

const actionMutate = vi.fn(
  (
    _payload: unknown,
    opts?: { onSuccess?: (r: ActionResult) => void; onError?: (e: unknown) => void },
  ) => {
    opts?.onSuccess?.(hookState.actionResult)
  },
)

const undoMutate = vi.fn()

function stubUndo(action: UndoDescriptor['action']): UndoDescriptor {
  return { action, id: 'top-id', fromEmail: 'a@b.com', fromName: 'A', addedToList: true, listName: 'ok' }
}

vi.mock('../lib/queries.ts', () => ({
  useQueue: () => hookState.queue,
  useAction: () => ({ mutate: actionMutate, isPending: hookState.actionIsPending }),
  useUndo: () => ({ mutate: undoMutate, isPending: false }),
}))

// Import AFTER the mock is registered.
import { TriagePage } from '../triage/TriagePage.tsx'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEmail(id: string, over: Partial<TriageEmail> = {}): TriageEmail {
  return {
    id,
    threadId: null,
    fromEmail: `${id}@example.com`,
    fromName: `Name ${id}`,
    subject: `Subject ${id}`,
    snippet: `snippet ${id}`,
    date: '2026-06-01',
    tier: null,
    ruleLabels: [],
    hasUnsub: true,
    unsubUrl: 'https://example.com/unsub',
    unsubPost: null,
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  hookState.queue = {
    data: { emails: [makeEmail('e1'), makeEmail('e2')], counts: { left: 2 } },
    isPending: false,
    isError: false,
  }
  hookState.actionResult = { ok: true, undo: stubUndo('ok-clean') }
  hookState.actionIsPending = false
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Keyboard shortcuts', () => {
  test('1. ArrowRight in hidden mode commits ok-clean (reuses swipeAction hidden+right)', () => {
    render(<TriagePage />)

    // Default mode is 'hidden'. swipeAction('hidden','right') === 'ok-clean'
    fireEvent.keyDown(document, { key: 'ArrowRight' })

    expect(actionMutate).toHaveBeenCalledTimes(1)
    const payload = actionMutate.mock.calls[0][0] as { action: string; id: string }
    expect(payload.action).toBe('ok-clean')
    expect(payload.id).toBe('e1')
  })

  test('2. ArrowLeft in hidden mode commits junk (swipeAction hidden+left)', () => {
    render(<TriagePage />)

    fireEvent.keyDown(document, { key: 'ArrowLeft' })

    expect(actionMutate).toHaveBeenCalledTimes(1)
    const payload = actionMutate.mock.calls[0][0] as { action: string; id: string }
    expect(payload.action).toBe('junk')
  })

  test('3. ArrowUp in hidden mode commits vip (swipeAction hidden+up)', () => {
    render(<TriagePage />)

    fireEvent.keyDown(document, { key: 'ArrowUp' })

    expect(actionMutate).toHaveBeenCalledTimes(1)
    const payload = actionMutate.mock.calls[0][0] as { action: string; id: string }
    expect(payload.action).toBe('vip')
  })

  test('4. ArrowDown in hidden mode commits delete (swipeAction hidden+down)', () => {
    render(<TriagePage />)

    fireEvent.keyDown(document, { key: 'ArrowDown' })

    expect(actionMutate).toHaveBeenCalledTimes(1)
    const payload = actionMutate.mock.calls[0][0] as { action: string; id: string }
    expect(payload.action).toBe('delete')
  })

  test('5. u key calls useUndo.mutate with the last action descriptor', () => {
    const desc = stubUndo('ok-clean')
    hookState.actionResult = { ok: true, undo: desc }
    render(<TriagePage />)

    // First commit an action via arrow key to set the last descriptor.
    fireEvent.keyDown(document, { key: 'ArrowRight' })

    // Now press u — should call undoMutate with that descriptor.
    fireEvent.keyDown(document, { key: 'u' })

    expect(undoMutate).toHaveBeenCalledTimes(1)
    expect(undoMutate.mock.calls[0][0]).toEqual(desc)
  })

  test('6. single-in-flight guard: keystroke ignored while action isPending', () => {
    hookState.actionIsPending = true
    render(<TriagePage />)

    fireEvent.keyDown(document, { key: 'ArrowRight' })

    expect(actionMutate).not.toHaveBeenCalled()
  })

  test('7. keystroke ignored when target is an input element', () => {
    render(<TriagePage />)

    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    fireEvent.keyDown(input, { key: 'ArrowRight' })

    expect(actionMutate).not.toHaveBeenCalled()

    document.body.removeChild(input)
  })

  test('8. keystroke ignored when target is a textarea', () => {
    render(<TriagePage />)

    const textarea = document.createElement('textarea')
    document.body.appendChild(textarea)

    fireEvent.keyDown(textarea, { key: 'ArrowRight' })

    expect(actionMutate).not.toHaveBeenCalled()

    document.body.removeChild(textarea)
  })

  test('9. u key is a no-op when there is no previous action (no undo descriptor)', () => {
    render(<TriagePage />)

    // Press u without any prior action — should not call undoMutate.
    fireEvent.keyDown(document, { key: 'u' })

    expect(undoMutate).not.toHaveBeenCalled()
  })

  test('10. U (uppercase) also triggers undo', () => {
    const desc = stubUndo('ok-clean')
    hookState.actionResult = { ok: true, undo: desc }
    render(<TriagePage />)

    fireEvent.keyDown(document, { key: 'ArrowRight' })
    fireEvent.keyDown(document, { key: 'U' })

    expect(undoMutate).toHaveBeenCalledTimes(1)
    expect(undoMutate.mock.calls[0][0]).toEqual(desc)
  })
})

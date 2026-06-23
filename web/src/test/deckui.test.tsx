import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, fireEvent, act } from '@testing-library/react'
import type { TriageEmail, ActionResult, UndoDescriptor } from '../lib/api.ts'

// ---------------------------------------------------------------------------
// Mock the Task-5 hooks so the Deck UI renders without a backend.
// Controllable: queue data/status, action result, mutate spies.
// ---------------------------------------------------------------------------

interface QueueState {
  data: { emails: TriageEmail[]; counts: { left: number } } | undefined
  isPending: boolean
  isError: boolean
}

const hookState: {
  queue: QueueState
  actionResult: ActionResult
} = {
  queue: { data: undefined, isPending: false, isError: false },
  actionResult: { ok: true, undo: stubUndo('ok') },
}

const actionMutate = vi.fn(
  (
    _payload: unknown,
    opts?: { onSuccess?: (r: ActionResult) => void; onError?: (e: unknown) => void; onSettled?: () => void },
  ) => {
    // Resolve synchronously with the configured result so tests are deterministic.
    // Mirror react-query's settle order: onSuccess/onError then onSettled (the
    // FIX-B single-in-flight lock releases in onSettled).
    opts?.onSuccess?.(hookState.actionResult)
    opts?.onSettled?.()
  },
)

const undoMutate = vi.fn()

function stubUndo(action: UndoDescriptor['action']): UndoDescriptor {
  return { action, id: 'top-id', fromEmail: 'a@b.com', fromName: 'A', addedToList: true, listName: 'ok' }
}

vi.mock('../lib/queries.ts', () => ({
  useQueue: () => hookState.queue,
  useAction: () => ({ mutate: actionMutate, isPending: false }),
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

function loadedQueue(emails: TriageEmail[], left = emails.length): void {
  hookState.queue = { data: { emails, counts: { left } }, isPending: false, isError: false }
}

beforeEach(() => {
  vi.clearAllMocks()
  hookState.queue = { data: { emails: [makeEmail('e1'), makeEmail('e2')], counts: { left: 2 } }, isPending: false, isError: false }
  hookState.actionResult = { ok: true, undo: stubUndo('ok') }
})

// The nine action accessible names exactly as rendered by the UI (aria-label
// / text per action). Exact strings so "OK" doesn't also match "OK & Clean".
const ACTION_LABELS: Record<string, string> = {
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TriagePage / Deck UI', () => {
  test('1. filter chip is pressed (hidden mode) by default', () => {
    render(<TriagePage />)
    const chip = screen.getByRole('button', { name: /hide.*(vip|ok|listed)/i })
    expect(chip).toHaveAttribute('aria-pressed', 'true')
  })

  test('2. clicking "OK" in the opened More sheet calls action.mutate with {action:"ok"} for the TOP card', () => {
    render(<TriagePage />)
    fireEvent.click(screen.getByRole('button', { name: /more actions/i }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('menuitem', { name: ACTION_LABELS.ok }))
    expect(actionMutate).toHaveBeenCalledTimes(1)
    const payload = actionMutate.mock.calls[0][0] as { action: string; id: string }
    expect(payload.action).toBe('ok')
    expect(payload.id).toBe('e1')
  })

  test('3. a11y parity (DECK-3): every one of the 9 actions is a labeled control across button row + More, no gesture', () => {
    render(<TriagePage />)
    const reachable = new Set<string>()

    // Button row (sheet closed): record every action-named button.
    for (const [action, label] of Object.entries(ACTION_LABELS)) {
      if (screen.queryByRole('button', { name: label })) reachable.add(action)
    }

    // Full overflow sheet (open): record every action-named menuitem.
    fireEvent.click(screen.getByRole('button', { name: /more actions/i }))
    for (const [action, label] of Object.entries(ACTION_LABELS)) {
      if (screen.queryByRole('menuitem', { name: label })) reachable.add(action)
    }

    expect(reachable).toEqual(new Set(Object.keys(ACTION_LABELS)))
  })

  test('4. a guard result opens GuardDialog; confirming re-calls the action with confirmed:true', () => {
    hookState.actionResult = { ok: false, guard: { count: 250, message: '250 emails will be archived' } }
    render(<TriagePage />)

    // Trigger an action (Archive is in the hidden-mode button row).
    fireEvent.click(screen.getByRole('button', { name: ACTION_LABELS.archive }))

    // GuardDialog visible with count/message.
    expect(screen.getByText(/250 emails will be archived/i)).toBeInTheDocument()

    // Next call should succeed.
    hookState.actionResult = { ok: true, undo: stubUndo('archive') }
    fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }))

    const last = actionMutate.mock.calls.at(-1)![0] as { confirmed?: boolean; action: string }
    expect(last.confirmed).toBe(true)
    expect(last.action).toBe('archive')
  })

  test('5. an {error:"gmail_auth"} result renders the Reconnect Gmail state (distinct from empty)', () => {
    hookState.actionResult = { ok: false, error: 'gmail_auth' }
    render(<TriagePage />)
    fireEvent.click(screen.getByRole('button', { name: ACTION_LABELS.archive }))
    expect(screen.getByText(/reconnect gmail/i)).toBeInTheDocument()
    expect(screen.queryByText(/inbox triaged/i)).not.toBeInTheDocument()
  })

  test('6a. filter-hidden empty state shows "Show all"', () => {
    loadedQueue([], 0)
    render(<TriagePage />)
    // Default mode is hidden → empty queue means "filter-hidden" → Show all.
    expect(screen.getByRole('button', { name: /show all/i })).toBeInTheDocument()
    expect(screen.queryByText(/inbox triaged/i)).not.toBeInTheDocument()
  })

  test('6b. genuinely-empty (shown mode) state shows "Inbox triaged"', () => {
    loadedQueue([], 0)
    render(<TriagePage />)
    // Toggle to shown mode, then queue stays empty → genuinely triaged.
    fireEvent.click(screen.getByRole('button', { name: /hide.*(vip|ok|listed)/i }))
    expect(screen.getByText(/inbox triaged/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /show all/i })).not.toBeInTheDocument()
  })

  test('7. the undo toast button calls useUndo.mutate with the action result descriptor', () => {
    const desc = stubUndo('archive')
    hookState.actionResult = { ok: true, undo: desc }
    render(<TriagePage />)
    fireEvent.click(screen.getByRole('button', { name: ACTION_LABELS.archive }))
    const toast = screen.getByRole('status')
    fireEvent.click(within(toast).getByRole('button', { name: /undo/i }))
    expect(undoMutate).toHaveBeenCalledTimes(1)
    expect(undoMutate.mock.calls[0][0]).toEqual(desc)
  })

  test('7b. honest bulk copy: ok-clean toast says listed removed + N stay archived', () => {
    hookState.actionResult = { ok: true, labeled: 7, undo: stubUndo('ok-clean') }
    render(<TriagePage />)
    // ok-clean lives in the More sheet (hidden mode).
    fireEvent.click(screen.getByRole('button', { name: /more actions/i }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('menuitem', { name: ACTION_LABELS['ok-clean'] }))
    const toast = screen.getByRole('status')
    expect(within(toast).getByText(/listed removed/i)).toBeInTheDocument()
    expect(within(toast).getByText(/7.*stay archived/i)).toBeInTheDocument()
  })

  test('7c. honest unsub copy (FIX H3): toast does NOT claim "undo available" and renders NO Undo button', () => {
    hookState.actionResult = { ok: true, undo: stubUndo('unsub') }
    render(<TriagePage />)
    // Unsub is in the hidden-mode button row.
    fireEvent.click(screen.getByRole('button', { name: ACTION_LABELS.unsub }))
    const toast = screen.getByRole('status')
    expect(within(toast).queryByText(/undo available/i)).not.toBeInTheDocument()
    expect(within(toast).queryByRole('button', { name: /undo/i })).not.toBeInTheDocument()
    expect(within(toast).getByText(/not reversible here/i)).toBeInTheDocument()
  })

  test('8. committing an action writes the new top card sender + subject into the aria-live region (DECK-2)', () => {
    loadedQueue([makeEmail('e1'), makeEmail('e2')], 2)
    render(<TriagePage />)
    fireEvent.click(screen.getByRole('button', { name: ACTION_LABELS.archive }))
    const live = document.querySelector('[aria-live="polite"]')
    expect(live).not.toBeNull()
    // After acting on e1, the announcement should name the new top card (e2).
    expect(live!.textContent).toMatch(/Name e2/)
    expect(live!.textContent).toMatch(/Subject e2/)
  })

  test('9. body renders ONLY as a sandboxed iframe (no dangerouslySetInnerHTML), with View all from sender link', () => {
    render(<TriagePage />)
    // Expand the body.
    fireEvent.click(screen.getByRole('button', { name: /show (email )?body|expand/i }))
    const iframe = document.querySelector('iframe')
    expect(iframe).not.toBeNull()
    expect(iframe!.getAttribute('sandbox')).toBe('allow-popups')
    expect(iframe!.getAttribute('src')).toContain('/api/triage/body?id=e1')
    const senderLink = screen.getByRole('link', { name: /view all from .*sender/i })
    expect(senderLink).toBeInTheDocument()
    // FIX D — the link must hit the live /sender route contract (?email=&name=),
    // not the broken ?q= that always redirects home.
    expect(senderLink.getAttribute('href')).toContain('email=')
    expect(senderLink.getAttribute('href')).toContain('e1%40example.com')
  })

  test('9b. peek (background) cards are inert (FIX C, WCAG 4.1.2) while the top card is not', () => {
    loadedQueue([makeEmail('e1'), makeEmail('e2'), makeEmail('e3')], 3)
    render(<TriagePage />)
    // Peek wrappers carry the `inert` attribute (out of tab order + a11y tree).
    const inertWrappers = document.querySelectorAll('[inert]')
    expect(inertWrappers.length).toBeGreaterThan(0)
    // The top card's "View all" link must NOT live inside an inert subtree.
    const topLink = screen.getAllByRole('link', { name: /view all from .*sender/i }).find(
      (a) => a.closest('[inert]') === null,
    )
    expect(topLink).toBeTruthy()
    expect(topLink!.getAttribute('href')).toContain('e1%40example.com')
  })

  test('10. loading state shows a skeleton', () => {
    hookState.queue = { data: undefined, isPending: true, isError: false }
    render(<TriagePage />)
    expect(screen.getByTestId('deck-skeleton')).toBeInTheDocument()
  })
})

// keep `act` referenced for potential async flushes without unused-import error
void act

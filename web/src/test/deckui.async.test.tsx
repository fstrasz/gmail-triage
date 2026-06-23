import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { TriageEmail, ActionResult, UndoDescriptor } from '../lib/api.ts'

// ---------------------------------------------------------------------------
// REAL coordination test: render TriagePage inside a real QueryClientProvider
// so useQueue / useAction's real onMutate + onSuccess run. Only the network
// boundary (../lib/api.ts) is mocked, and postAction resolves ASYNCHRONOUSLY
// — this exercises the genuine interleave of onMutate's cache filter (which
// re-fires the `load` effect) with the action resolving to a guard/auth, the
// path the synchronous deckui.test.tsx mocks away (false-green).
// ---------------------------------------------------------------------------

const api = vi.hoisted(() => ({
  getQueue: vi.fn(),
  getNext: vi.fn(),
  getBodyUrl: vi.fn((id: string) => `/api/triage/body?id=${id}`),
  postAction: vi.fn(),
  postUndo: vi.fn(),
}))

vi.mock('../lib/api.ts', () => api)

// Import AFTER the mock is registered.
import { TriagePage } from '../triage/TriagePage.tsx'

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

function stubUndo(action: UndoDescriptor['action']): UndoDescriptor {
  return { action, id: 'e1', fromEmail: 'e1@example.com', fromName: 'Name e1', addedToList: true, listName: 'ok' }
}

/** A manually-resolvable deferred so the test controls WHEN postAction resolves. */
function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function renderWithClient(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
  api.getQueue.mockResolvedValue({ emails: [makeEmail('e1'), makeEmail('e2')], counts: { left: 2 } })
})

describe('TriagePage / real React-Query interleave', () => {
  test('guard: card is restored to the top of the deck and GuardDialog opens after an ASYNC guard resolve', async () => {
    const d = deferred<ActionResult>()
    api.postAction.mockReturnValueOnce(d.promise)

    renderWithClient(<TriagePage />)

    // Wait for the queue to load and the deck to render the top card (e1).
    await screen.findByText('Subject e1')

    // Archive is in the hidden-mode button row.
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }))

    // Resolve the action with a guard AFTER onMutate's optimistic cache filter
    // has already fired (and the `load` effect has re-run, clearing removed[]).
    d.resolve({ ok: false, guard: { count: 250, message: '250 emails will be archived' } })

    // The dialog must be about a card that is STILL present: e1 stays on top.
    await screen.findByText(/250 emails will be archived/i)
    expect(screen.getByText('Subject e1')).toBeInTheDocument()

    // Confirming re-posts for THAT SAME card with confirmed:true.
    api.postAction.mockResolvedValueOnce({ ok: true, undo: stubUndo('archive') })
    fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }))

    await waitFor(() => {
      const last = api.postAction.mock.calls.at(-1)![0] as { confirmed?: boolean; action: string; id: string }
      expect(last.confirmed).toBe(true)
      expect(last.action).toBe('archive')
      expect(last.id).toBe('e1')
    })

    // On confirmed-success e1 is removed and stays removed (e2 is now the top).
    await screen.findByText('Subject e2')
    expect(screen.queryByText('Subject e1')).not.toBeInTheDocument()

    // DECK-2: the confirmed-success path ALSO announces, reading the correct
    // new top (e2), not a stale closure value.
    const live = document.querySelector('[aria-live="polite"]')
    expect(live!.textContent).toMatch(/Name e2/)
    expect(live!.textContent).toMatch(/Subject e2/)
  })

  test('auth: card is restored and the Reconnect Gmail state shows after an ASYNC gmail_auth resolve', async () => {
    const d = deferred<ActionResult>()
    api.postAction.mockReturnValueOnce(d.promise)

    renderWithClient(<TriagePage />)
    await screen.findByText('Subject e1')

    fireEvent.click(screen.getByRole('button', { name: 'Archive' }))
    d.resolve({ ok: false, error: 'gmail_auth' })

    // Distinct Reconnect state shows (not the empty "Inbox triaged").
    await screen.findByText(/reconnect gmail/i)
    expect(screen.queryByText(/inbox triaged/i)).not.toBeInTheDocument()

    // The just-acted card must be RESTORED to the visible deck (not lost behind
    // the Reconnect state) — this is the half that fails on the buggy code.
    expect(screen.getByText('Subject e1')).toBeInTheDocument()
  })
})

import { useEffect, useReducer, useRef, useState } from 'react'
import type { TriageEmail, TriageAction, ActionResult, UndoDescriptor } from '../lib/api.ts'
import { useQueue, useAction, useUndo } from '../lib/queries.ts'
import { deckReducer } from './deckReducer.ts'
import type { Mode } from './swipeMap.ts'
import { ACTION_LABEL } from './actionMeta.ts'
import { Deck } from './Deck.tsx'
import { GuardDialog } from './GuardDialog.tsx'
import type { GuardInfo } from './GuardDialog.tsx'
import { Toast } from './Toast.tsx'
import type { ToastInfo } from './Toast.tsx'

const QUEUE_LIMIT = 25

// A pending action: the payload we'd re-send on guard-confirm, kept so the
// confirm path re-calls the mutation with confirmed:true for the same card.
interface PendingAction {
  action: TriageAction
  card: TriageEmail
}

export function TriagePage() {
  const [mode, setMode] = useState<Mode>('hidden') // FIX: filter default ON (hidden)
  const hideListed = mode === 'hidden'
  const queueParams = { hideListed, limit: QUEUE_LIMIT }

  const queue = useQueue(queueParams)
  const action = useAction()
  const undo = useUndo(queueParams)

  const [deck, dispatch] = useReducer(deckReducer, { cards: [], removed: [], mode })
  const [guard, setGuard] = useState<GuardInfo | null>(null)
  const [toast, setToast] = useState<ToastInfo | null>(null)
  const [authError, setAuthError] = useState(false)
  const [announce, setAnnounce] = useState('')
  const pending = useRef<PendingAction | null>(null)

  // Sync deck cards from the query whenever data or mode changes.
  const emails = queue.data?.emails
  useEffect(() => {
    if (emails) dispatch({ type: 'load', cards: emails })
  }, [emails])
  useEffect(() => {
    dispatch({ type: 'setMode', mode })
  }, [mode])

  function announceAfterAdvance(committed: TriageAction, nextTop: TriageEmail | undefined) {
    const verb = ACTION_LABEL[committed]
    const next = nextTop
      ? `Next: ${nextTop.fromName ?? nextTop.fromEmail ?? 'Unknown'} — ${nextTop.subject}`
      : 'Queue empty'
    setAnnounce(`${verb} done. ${next}`)
  }

  function handleResult(result: ActionResult, committed: TriageAction, card: TriageEmail, labeled?: number) {
    if (result.ok) {
      setToast({ undo: result.undo, labeled: result.labeled ?? labeled })
      return
    }
    if ('error' in result) {
      // M1 — distinct auth state, NOT empty.
      setAuthError(true)
      // Restore the card we optimistically advanced past.
      dispatch({ type: 'undo' })
      return
    }
    // guard — restore the card and open the confirm dialog.
    dispatch({ type: 'undo' })
    pending.current = { action: committed, card }
    setGuard(result.guard)
  }

  function commit(act: TriageAction, confirmed = false) {
    const card = confirmed ? pending.current?.card : deck.cards[0]
    if (!card) return

    // Dispatch exactly ONE of {act, advance}: act removes the top card and
    // pairs with the API call.
    if (!confirmed) {
      dispatch({ type: 'act', action: act })
      announceAfterAdvance(act, deck.cards[1])
    }

    action.mutate(
      {
        id: card.id,
        action: act,
        fromEmail: card.fromEmail,
        fromName: card.fromName,
        unsubUrl: card.unsubUrl,
        unsubPost: card.unsubPost,
        confirmed: confirmed || undefined,
        queueParams,
      },
      {
        onSuccess: (result: ActionResult) => handleResult(result, act, card),
        onError: () => {
          // Unexpected failure: restore the card.
          if (!confirmed) dispatch({ type: 'undo' })
        },
      },
    )
  }

  function onUndo(descriptor: UndoDescriptor) {
    setToast(null)
    undo.mutate(descriptor)
  }

  function confirmGuard() {
    const p = pending.current
    setGuard(null)
    if (p) commit(p.action, true)
    pending.current = null
  }

  function cancelGuard() {
    setGuard(null)
    pending.current = null
  }

  // ---- States --------------------------------------------------------------

  if (authError || queue.isError) {
    return <ReconnectGmail />
  }

  return (
    <div className="flex h-full flex-col p-4">
      {/* Visually-hidden live region (DECK-2). */}
      <div aria-live="polite" className="sr-only">{announce}</div>

      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-ink">
          Triage <span className="font-mono text-muted">{queue.data?.counts.left ?? 0}</span>
        </h1>
        <button
          type="button"
          aria-label="Hide VIP/OK listed senders"
          aria-pressed={hideListed}
          onClick={() => setMode(hideListed ? 'shown' : 'hidden')}
          className={`rounded-full border px-3 py-1 text-sm font-medium ${
            hideListed ? 'border-ink bg-ink text-white' : 'border-hairline text-muted'
          }`}
        >
          Hide VIP/OK
        </button>
      </header>

      {queue.isPending ? (
        <DeckSkeleton />
      ) : deck.cards.length === 0 ? (
        <EmptyState mode={mode} hiddenCount={queue.data?.counts.left ?? 0} onShowAll={() => setMode('shown')} />
      ) : (
        <Deck cards={deck.cards} mode={mode} onAction={(a) => commit(a)} />
      )}

      <GuardDialog guard={guard} onConfirm={confirmGuard} onCancel={cancelGuard} />
      {toast && <Toast info={toast} onUndo={onUndo} onDismiss={() => setToast(null)} />}
    </div>
  )
}

// ---- Sub-states ------------------------------------------------------------

function DeckSkeleton() {
  return (
    <div data-testid="deck-skeleton" className="mx-auto w-full max-w-md flex-1 animate-pulse">
      <div className="h-80 rounded-2xl border border-hairline bg-hairline/40" />
    </div>
  )
}

function EmptyState({ mode, hiddenCount, onShowAll }: { mode: Mode; hiddenCount: number; onShowAll: () => void }) {
  // DECK-4: in hidden mode an empty queue may just be filtered — offer Show all.
  if (mode === 'hidden') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-muted">
        <p>{hiddenCount} listed sender{hiddenCount === 1 ? '' : 's'} hidden.</p>
        <button
          type="button"
          className="rounded-xl border border-ink px-4 py-2 font-semibold text-ink"
          onClick={onShowAll}
        >
          Show all
        </button>
      </div>
    )
  }
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center text-muted">
      <p className="text-lg font-semibold text-ink">Inbox triaged</p>
      <p className="mt-1 text-sm">Nothing left to triage.</p>
    </div>
  )
}

function ReconnectGmail() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
      <p className="text-lg font-semibold text-ink">Reconnect Gmail</p>
      <p className="text-sm text-muted">The Gmail connection expired. Re-authorize to continue triaging.</p>
      <a href="/auth" className="rounded-xl bg-ink px-4 py-2 font-semibold text-white">
        Reconnect
      </a>
    </div>
  )
}

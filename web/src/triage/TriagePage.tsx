import { useEffect, useReducer, useRef, useState } from 'react'
import type { TriageEmail, TriageAction, ActionResult, UndoDescriptor } from '../lib/api.ts'
import { useQueue, useAction, useUndo } from '../lib/queries.ts'
import { deckReducer } from './deckReducer.ts'
import type { Mode, Dir } from './swipeMap.ts'
import { swipeAction } from './swipeMap.ts'
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

// Arrow key → swipe direction mapping.
const KEY_DIR: Record<string, Dir> = {
  ArrowRight: 'right',
  ArrowLeft: 'left',
  ArrowUp: 'up',
  ArrowDown: 'down',
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
  // Lifted from Deck so the keyboard handler can read whether More sheet is open.
  const [moreOpen, setMoreOpen] = useState(false)
  const pending = useRef<PendingAction | null>(null)
  // DECK-2: action committed but not yet announced. The new-top card is read
  // from post-dispatch deck state (an effect), never a stale pre-dispatch
  // closure value like deck.cards[1].
  const pendingAnnounce = useRef<TriageAction | null>(null)

  // Sync deck cards from the query whenever data or mode changes. The reducer's
  // `load` reconciles against local optimistic state (it no longer clears
  // removed[]), so this firing mid-action — including from useAction.onMutate's
  // cache filter — won't strand the just-acted card.
  const emails = queue.data?.emails
  useEffect(() => {
    if (emails) dispatch({ type: 'load', cards: emails })
  }, [emails])
  useEffect(() => {
    dispatch({ type: 'setMode', mode })
  }, [mode])

  // DECK-2: announce after the deck advances, reading the CURRENT top card
  // (post-dispatch), for both the unconfirmed and confirmed-success paths.
  const top = deck.cards[0]
  useEffect(() => {
    const committed = pendingAnnounce.current
    if (!committed) return
    pendingAnnounce.current = null
    const verb = ACTION_LABEL[committed]
    const next = top
      ? `Next: ${top.fromName ?? top.fromEmail ?? 'Unknown'} — ${top.subject}`
      : 'Queue empty'
    setAnnounce(`${verb} done. ${next}`)
  }, [deck.cards, top])

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

    // Dispatch exactly ONE `act` per user gesture and advance via the explicit
    // reducer contract — on the confirmed path too (the guard revert put the
    // card back, so we re-remove it here rather than relying on the cache→load
    // effect). Announce on both paths (DECK-2), reading the new top post-dispatch.
    dispatch({ type: 'act', action: act })
    pendingAnnounce.current = act

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
          dispatch({ type: 'undo' })
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

  // ---- Keyboard shortcuts ---------------------------------------------------
  // Attach at document level; cleaned up on unmount. Only fires when no modal
  // is open and no action is in flight (single-in-flight invariant).

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Never hijack keystrokes in text fields or contenteditable elements.
      const target = e.target as Element | null
      if (target instanceof HTMLInputElement) return
      if (target instanceof HTMLTextAreaElement) return
      if (target instanceof HTMLElement && target.isContentEditable) return

      // Single-in-flight guard: ignore while an action mutation is pending, or
      // while a modal (guard dialog or More sheet) is blocking interaction.
      if (action.isPending) return
      if (guard !== null) return
      if (moreOpen) return

      const dir = KEY_DIR[e.key]
      if (dir) {
        e.preventDefault()
        commit(swipeAction(mode, dir))
        return
      }

      if (e.key === 'u' || e.key === 'U') {
        e.preventDefault()
        // Undo the last action using the toast descriptor (same path as clicking
        // the Toast Undo button). No-op if there's no toast/descriptor.
        if (toast?.undo) {
          onUndo(toast.undo)
        }
        return
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
    // Rebuild the listener whenever any of the captured state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, action.isPending, guard, moreOpen, toast, deck.cards])

  // ---- States --------------------------------------------------------------

  // A genuine queue fetch failure has no deck data to show — full-screen state.
  if (queue.isError) {
    return <ReconnectGmail />
  }

  return (
    <div className="flex h-full flex-col p-4">
      {/* Visually-hidden live region (DECK-2). */}
      <div aria-live="polite" className="sr-only">{announce}</div>

      {/* M1 — an action hit an expired Gmail token: distinct Reconnect state,
          shown as a banner ABOVE the deck so the just-acted card (restored by
          handleResult's `undo`) stays visible and is not lost. */}
      {authError && <ReconnectGmail banner />}

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

      {/* Desktop 3-pane: on md+ show a queue-list sidebar beside the active card.
          On small screens the existing single-column deck is unchanged. */}
      {queue.isPending ? (
        <DeckSkeleton />
      ) : deck.cards.length === 0 ? (
        <EmptyState mode={mode} hiddenCount={queue.data?.counts.left ?? 0} onShowAll={() => setMode('shown')} />
      ) : (
        <div className="flex flex-1 gap-4 overflow-hidden">
          {/* Queue list pane — visible only on md+ (aria-hidden: purely visual,
              the Card itself is the primary interactive element). */}
          <aside
            aria-hidden="true"
            className="hidden md:flex md:w-56 md:flex-col md:overflow-y-auto md:rounded-2xl md:border md:border-hairline md:bg-white md:shadow-sm"
          >
            <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted">Up next</p>
            <ul className="flex flex-col divide-y divide-hairline">
              {deck.cards.map((card, i) => (
                <li
                  key={card.id}
                  className={`px-3 py-2 text-sm ${i === 0 ? 'bg-hairline/30 font-semibold text-ink' : 'text-muted'}`}
                >
                  <p className="truncate">{card.fromName ?? card.fromEmail ?? 'Unknown'}</p>
                  {card.fromEmail && i > 0 && (
                    <p className="truncate text-xs">{card.fromEmail}</p>
                  )}
                </li>
              ))}
            </ul>
          </aside>

          {/* Active card + toolbar pane */}
          <div className="flex flex-1 flex-col overflow-hidden">
            <Deck
              cards={deck.cards}
              mode={mode}
              onAction={(a) => commit(a)}
              moreOpen={moreOpen}
              onMoreOpenChange={setMoreOpen}
            />
          </div>
        </div>
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

function ReconnectGmail({ banner = false }: { banner?: boolean }) {
  if (banner) {
    // Compact variant: sits above the deck so the restored card stays visible.
    return (
      <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-junk/40 bg-junk/5 px-4 py-3 text-sm">
        <span className="font-semibold text-ink">Reconnect Gmail</span>
        <a href="/auth" className="rounded-lg bg-ink px-3 py-1.5 font-semibold text-white">
          Reconnect
        </a>
      </div>
    )
  }
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

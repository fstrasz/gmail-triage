import { Keyboard } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import type { ActionResult, TriageAction, TriageEmail } from "../lib/api.ts";
import { dismissJob, getBodyUrl, retryJob } from "../lib/api.ts";
import { shortDate } from "../lib/format.ts";
import { loadMode, saveMode } from "../lib/persistMode.ts";
import {
  currentStartedFetchSeq,
  useAction,
  useActionInFlight,
  useQueue,
  useQueueStatus,
  useUndo,
} from "../lib/queries.ts";
import { useMediaQuery } from "../lib/useMediaQuery.ts";
import { Stamp } from "../shell/Stamp.tsx";
import {
  btnPrimary,
  btnQuiet,
  kbd,
  label,
  linkAction,
  pill,
  sheet,
} from "../shell/ui.ts";
import {
  ACTION_COLOR,
  ACTION_LABEL,
  ACTION_TONE,
  isUndoable,
} from "./actionMeta.ts";
import { TierStamp } from "./Card.tsx";
import { Deck } from "./Deck.tsx";
import { deckReducer } from "./deckReducer.ts";
import { DeleteChoiceDialog } from "./DeleteChoiceDialog.tsx";
import type { GuardInfo } from "./GuardDialog.tsx";
import { GuardDialog } from "./GuardDialog.tsx";
import { QueueCounter } from "./QueueCounter.tsx";
import { coveredCardIds } from "./queueScope.ts";
import { ACTION_KEY, ShortcutsDialog } from "./ShortcutsDialog.tsx";
import type { Dir, Mode } from "./swipeMap.ts";
import { arrowAction } from "./swipeMap.ts";
import type { ToastInfo } from "./Toast.tsx";
import { toastMessage } from "./toastMessage.ts";

const QUEUE_LIMIT = 25;
// Below this many cards the deck asks the server for more.
const LOW_WATER = 10;

// Actions the server may answer with a bulk guard instead of queueing: these
// wait for their response before another may-guard action can start (the
// guard dialog holds one pending action). Sender-wide actions always may.
const GUARDABLE = new Set<TriageAction>([
  "ok",
  "vip",
  "ok-clean",
  "vip-clean",
  "junk",
  "delete-all",
  "archive-all",
]);
const SENDER_WIDE = new Set<TriageAction>(["delete-all", "archive-all"]);

// Why a removed card stays hidden even if a deck refetch still lists it: its
// enqueue is in flight, or it belongs to a queued job. `liftedSeq` is how many
// queue fetches had STARTED when the job was seen not active; the card stays
// hidden until data from a fetch started after that has landed.
type Suppression = "enqueuing" | { jobId: string; liftedSeq?: number };

// Workbench action column, in groups. Delete All sits directly after Delete
// so the sender-wide pair reads as an extension of it.
const DESKTOP_GROUPS: { title: string; actions: TriageAction[] }[] = [
  { title: "Keep", actions: ["vip", "ok"] },
  { title: "Keep & clean", actions: ["vip-clean", "ok-clean"] },
  { title: "File", actions: ["archive", "review", "unsub"] },
  { title: "Remove", actions: ["junk", "delete"] },
  { title: "All from this sender", actions: ["delete-all", "archive-all"] },
];

// Letter shortcut → action (keys come from ACTION_KEY, shared with the dialog).
const KEY_ACTION = new Map<string, TriageAction>(
  (Object.entries(ACTION_KEY) as [TriageAction, string][]).map(([a, k]) => [
    k,
    a,
  ]),
);

// A pending action: the payload we'd re-send on guard-confirm, kept so the
// confirm path re-calls the mutation with confirmed:true for the same card.
interface PendingAction {
  action: TriageAction;
  card: TriageEmail;
}

// Arrow key → swipe direction mapping.
const KEY_DIR: Record<string, Dir> = {
  ArrowRight: "right",
  ArrowLeft: "left",
  ArrowUp: "up",
  ArrowDown: "down",
};

export function TriagePage() {
  const [mode, setMode] = useState<Mode>(loadMode); // filter default ON (hidden); persisted across visits (#28)
  const hideListed = mode === "hidden";
  // Memoized so it only changes identity when hideListed actually flips —
  // `commit` below depends on it, and a fresh object every render would
  // defeat that memoization.
  const queueParams = useMemo(
    () => ({ hideListed, limit: QUEUE_LIMIT }),
    [hideListed],
  );

  const queue = useQueue(queueParams);
  const action = useAction();
  const undo = useUndo(queueParams);
  const queueStatus = useQueueStatus();
  const status = queueStatus.data;
  const actionInFlight = useActionInFlight();
  // Absent = on (the server's default).
  const bulkGuardEnabled = status?.bulkGuardEnabled ?? true;

  // Layout by capability AND room: a mouse, or a screen wide enough for four
  // panes (iPad landscape, desktop), gets the workbench. Touch below that gets
  // the swipe deck — with a tappable queue beside it from tablet width up.
  const finePointer = useMediaQuery("(hover: hover) and (pointer: fine)");
  const wide = useMediaQuery("(min-width: 1024px)");
  const tablet = useMediaQuery("(min-width: 768px)");
  const desktop = (finePointer && tablet) || wide;
  const keyboardShortcuts = desktop || tablet;
  const [deck, dispatch] = useReducer(deckReducer, {
    cards: [],
    removed: [],
    mode,
    selectedId: null,
  });
  const [guard, setGuard] = useState<GuardInfo | null>(null);
  // Touch Delete: the card awaiting "this one or all from the sender?".
  const [deleteChoice, setDeleteChoice] = useState<TriageEmail | null>(null);
  const [toast, setToast] = useState<ToastInfo | null>(null);
  const [authError, setAuthError] = useState(false);
  const [announce, setAnnounce] = useState("");
  // Lifted from Deck so the keyboard handler can read whether More sheet is open.
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  // Focus target after a queue click, so arrow keys work without a button
  // holding focus.
  const previewRef = useRef<HTMLDivElement>(null);
  const pending = useRef<PendingAction | null>(null);
  // DECK-2: action committed but not yet announced. The new-top card is read
  // from post-dispatch deck state (an effect), never a stale pre-dispatch
  // closure value like deck.cards[1]. (FIX G) Set only on the committed-success
  // path so a guard/auth result never falsely announces "done".
  const pendingAnnounce = useRef<TriageAction | null>(null);
  // Cards whose action has been dispatched and not yet answered, on EVERY
  // commit path (button taps, swipe, reader, keyboard). Two gestures in the
  // same tick still see the old active card; this synchronous set stops the
  // second from enqueueing the same card twice.
  const dispatchedIds = useRef(new Set<string>());
  // Held while a may-guard action awaits its response, so a second may-guard
  // action cannot start (the guard dialog has one pending slot). Actions that
  // can never be guarded do not take or wait for it.
  const committing = useRef(false);
  // Every card an action removed → what keeps it hidden (see `keepRemoved`).
  const suppressed = useRef(new Map<string, Suppression>());
  // Each commit's sequence number: only the latest one's response sets the toast.
  const commitSeq = useRef(0);
  // Jobs whose undo was deferred until they finish (state "undo-requested").
  const [undoWatch, setUndoWatch] = useState<string[]>([]);
  // Set once the first queue data has been loaded into the deck.
  const [deckLoaded, setDeckLoaded] = useState(false);
  // A short status shown in the toast area when no action toast is up (e.g. a
  // failed undo).
  const [notice, setNotice] = useState<string | null>(null);

  const emails = queue.data?.emails;
  // Which fetch produced the deck data on hand. Never `dataUpdatedAt`: that
  // also moves on every optimistic cache edit, which is not fresh server data.
  const queueSeq = queue.data?.fetchStartedSeq ?? 0;
  const activeIds = status?.activeIds;
  const statusAt = queueStatus.dataUpdatedAt;
  const refetchQueue = queue.refetch;

  // Lift a job's suppression once the status does not list it as active. The
  // deck may still hold, or have in flight, a stale copy of its cards (a fetch
  // the server answered before the job existed), so the cards stay hidden
  // until data from a fetch STARTED after the lift lands (the load effect
  // below). No refetch here: a status poll sees jobs finish every 2 s while the
  // operator works, and a queue fetch per poll is the Gmail-quota class the
  // spec rules out. The cards come back on the next natural fetch (low water,
  // window focus, undo). Lifting on a status that predates the job is safe:
  // any later fetch starts after the job exists, and the server excludes an
  // active job's mail.
  useEffect(() => {
    const active = new Set(activeIds);
    for (const s of suppressed.current.values()) {
      if (s === "enqueuing" || s.liftedSeq !== undefined) continue;
      if (active.has(s.jobId)) continue;
      s.liftedSeq = currentStartedFetchSeq();
    }
  }, [activeIds, statusAt]);

  // Sync deck cards from the query whenever data changes. The reducer's `load`
  // reconciles against local optimistic state; `keepRemoved` keeps a removed
  // card hidden while its enqueue is in flight, its job is not yet lifted, or
  // no fetch started after the lift has landed — so neither a refetch that
  // raced an enqueue nor a stale copy of a finished job can resurrect it. Once
  // that fresh data lands, server truth decides and the entry is dropped.
  useEffect(() => {
    if (!emails) return;
    const keepRemoved: string[] = [];
    for (const [id, s] of suppressed.current) {
      if (
        s !== "enqueuing" &&
        s.liftedSeq !== undefined &&
        queueSeq > s.liftedSeq
      ) {
        suppressed.current.delete(id);
      } else {
        keepRemoved.push(id);
      }
    }
    dispatch({ type: "load", cards: emails, keepRemoved });
    setDeckLoaded(true);
  }, [emails, queueSeq]);

  // Low-water refetch: fewer than LOW_WATER cards left, nothing fetching, no
  // enqueue awaiting its response. `lowWaterAt` is the deck length when it
  // last fired: it fires again only once the deck has shrunk further, so a
  // fetch that comes back short does not loop, and a fetch that was cancelled
  // or failed is retried on the next action instead of disarming the refill.
  // `deckLoaded` waits for the first `load` to reach the deck: in the render
  // that first delivers data the deck is still empty, which is not low water.
  const lowWaterAt = useRef<number | null>(null);
  const deckLen = deck.cards.length;
  const queueFetching = queue.isFetching;
  useEffect(() => {
    if (!deckLoaded) return;
    if (deckLen >= LOW_WATER) {
      lowWaterAt.current = null;
      return;
    }
    if (queueFetching || actionInFlight) return;
    if (lowWaterAt.current !== null && deckLen >= lowWaterAt.current) return;
    lowWaterAt.current = deckLen;
    void refetchQueue();
  }, [deckLoaded, deckLen, queueFetching, actionInFlight, refetchQueue]);

  // An undo that was deferred behind a running job lands when the job
  // finishes: refetch the deck once the status shows it has left activeIds.
  useEffect(() => {
    if (undoWatch.length === 0 || !activeIds) return;
    const finished = undoWatch.filter((id) => !activeIds.includes(id));
    if (finished.length === 0) return;
    setUndoWatch((w) => w.filter((id) => !finished.includes(id)));
    void refetchQueue();
  }, [undoWatch, activeIds, refetchQueue]);
  useEffect(() => {
    dispatch({ type: "setMode", mode });
    saveMode(mode);
  }, [mode]);

  // FIX E — a successful (re)fetch of the queue means Gmail is reachable again;
  // clear any stale Reconnect banner. Keyed on the fetch timestamp so a
  // post-reconnect refetch resets it.
  const dataUpdatedAt = queue.dataUpdatedAt;
  useEffect(() => {
    if (queue.isSuccess) setAuthError(false);
  }, [dataUpdatedAt, queue.isSuccess]);

  // The active card = the selected one (highlighted in the queue, shown in the
  // preview), falling back to the top. Actions operate on it; the deck reducer
  // keeps the selection in place (clicking the queue does NOT reorder).
  const active =
    deck.cards.find((c) => c.id === deck.selectedId) ?? deck.cards[0];

  // DECK-2: announce after the deck advances, reading the CURRENT active card
  // (post-dispatch), for both the unconfirmed and confirmed-success paths.
  useEffect(() => {
    const committed = pendingAnnounce.current;
    if (!committed) return;
    pendingAnnounce.current = null;
    const verb = ACTION_LABEL[committed];
    const next = active
      ? `Next: ${active.fromName ?? active.fromEmail ?? "Unknown"} — ${active.subject}`
      : "Queue empty";
    setAnnounce(`${verb} done. ${next}`);
  }, [deck.cards, deck.selectedId, active]);

  // Memoized with an empty dependency array — every value it closes over
  // (setAuthError/setToast/setGuard, dispatch, the pending/pendingAnnounce
  // refs) is stable across renders, so this identity never needs to change.
  // `commit` below depends on it; without that stability `commit` would be
  // forced to recreate on every render regardless of its own real deps.
  const handleResult = useCallback(
    (
      result: ActionResult,
      committed: TriageAction,
      card: TriageEmail,
      ids: string[],
      seq: number,
    ) => {
      if (result.ok) {
        // FIX E — a successful action proves the Gmail connection is live again;
        // clear any stale Reconnect banner.
        setAuthError(false);
        for (const id of ids) {
          suppressed.current.set(id, { jobId: result.jobId });
        }
        // A late response for an older commit must not replace the newer
        // toast: only the latest action carries Undo.
        if (seq === commitSeq.current) {
          setToast({ undo: { jobId: result.jobId, action: committed }, card });
        }
        // FIX G — announce ONLY on the committed-success path, reading the new top
        // post-dispatch (the effect below). A guard/auth result never announces.
        pendingAnnounce.current = committed;
        return;
      }
      // Guard or auth: put back THIS action's cards (never the LIFO `undo`,
      // which would restore whichever action happened to be last).
      for (const id of ids) suppressed.current.delete(id);
      dispatch({ type: "restore", ids });
      if ("error" in result) {
        // M1 — distinct auth state, NOT empty.
        setAuthError(true);
        return;
      }
      // guard — open the confirm dialog for this card.
      pending.current = { action: committed, card };
      setGuard(result.guard);
    },
    [],
  );

  // O1 fix — memoized on its REAL dependencies (active, action, queueParams,
  // handleResult). Previously this was a plain function recreated on every
  // render, but the keyboard-shortcut effect below closed over whatever
  // `commit` existed when the effect last ran and did NOT re-run when only
  // `deck.selectedId` changed (selecting a queue row leaves the `deck.cards`
  // array referentially identical). A shortcut fired after clicking a
  // different row then acted on the STALE previously-active card. Listing
  // this stable callback in the effect's dependency array fixes that: the
  // effect now re-runs whenever the active card actually changes.
  const commit = useCallback(
    (act: TriageAction, confirmed = false) => {
      const card = confirmed ? pending.current?.card : active;
      if (!card) return;
      // Locks at the TOP so EVERY path inherits them (button taps, swipe,
      // reader, keyboard): never the same card twice, and never a second
      // may-guard action while one awaits its response.
      if (dispatchedIds.current.has(card.id)) return;
      const mayGuard =
        SENDER_WIDE.has(act) || (bulkGuardEnabled && GUARDABLE.has(act));
      if (mayGuard && committing.current) return;

      // Every card the job will take care of leaves the deck now, as one group.
      const ids = coveredCardIds(act, card, deck.cards, { hideListed });
      for (const id of ids) {
        dispatchedIds.current.add(id);
        suppressed.current.set(id, "enqueuing");
      }
      if (mayGuard) committing.current = true;
      const seq = ++commitSeq.current;
      // The previous action's status stays up until the next action.
      setToast(null);
      setNotice(null);

      // One `act` per user gesture for the ACTIVE card (by id, so it works
      // regardless of position). The reducer removes the group, keeps the
      // cursor at that position, and advances. On the confirmed path the guard
      // restore put the cards back, so they are removed again here. Announce
      // set later, on success only.
      dispatch({ type: "act", action: act, id: card.id, ids });

      // mutateAsync, not mutate: per-call mutate callbacks fire only for the
      // LATEST call, and several enqueues may be in flight at once.
      action
        .mutateAsync({
          id: card.id,
          action: act,
          fromEmail: card.fromEmail,
          fromName: card.fromName,
          unsubUrl: card.unsubUrl,
          unsubPost: card.unsubPost,
          confirmed: confirmed || undefined,
          coveredIds: ids,
          queueParams,
        })
        .then(
          (result: ActionResult) => handleResult(result, act, card, ids, seq),
          () => {
            // Unexpected failure: put back this action's cards.
            for (const id of ids) suppressed.current.delete(id);
            dispatch({ type: "restore", ids });
          },
        )
        .then(() => {
          for (const id of ids) dispatchedIds.current.delete(id);
          if (mayGuard) committing.current = false;
        });
    },
    [
      active,
      action,
      queueParams,
      handleResult,
      bulkGuardEnabled,
      deck.cards,
      hideListed,
    ],
  );

  // Select a queue item in place (highlight it) — no reorder. The active card
  // moves to this row; the queue keeps its order. Acting on it removes it and
  // the queue closes up (handled by the reducer's `act`).
  function selectCard(id: string) {
    dispatch({ type: "select", id });
    previewRef.current?.focus();
  }

  // Memoized so the keyboard effect below (which calls this on 'u') doesn't
  // need to rebuild on every render for a callback that only actually
  // depends on `undo`.
  const onUndo = useCallback(
    ({ jobId }: ToastInfo["undo"]) => {
      setToast(null);
      setNotice(null);
      undo.mutateAsync({ jobId }).then(
        (r) => {
          // A running job applies the undo when it finishes: refetch then.
          if (r.state === "undo-requested") setUndoWatch((w) => [...w, jobId]);
        },
        // e.g. 400 not_undoable: the job failed in the meantime.
        () => setNotice("Undo failed — the action could not be undone"),
      );
    },
    [undo],
  );

  // Failed-job controls on the counter; the status refetch moves the counter
  // whether the request worked or not.
  const refetchStatus = queueStatus.refetch;
  const refreshStatus = () => {
    void refetchStatus();
  };
  const onRetry = (id: string) => {
    retryJob(id).then(refreshStatus, refreshStatus);
  };
  const onDismiss = (id: string) => {
    dismissJob(id).then(refreshStatus, refreshStatus);
  };

  function confirmGuard() {
    const p = pending.current;
    setGuard(null);
    if (p) commit(p.action, true);
    pending.current = null;
  }

  function cancelGuard() {
    setGuard(null);
    pending.current = null;
  }

  // ---- Keyboard shortcuts ---------------------------------------------------
  // Attach at document level; cleaned up on unmount. Only fires when no modal
  // is open. Actions do NOT wait for each other here — `commit` holds the locks.

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Never hijack keystrokes in text fields or contenteditable elements.
      const target = e.target as Element | null;
      if (target instanceof HTMLInputElement) return;
      if (target instanceof HTMLTextAreaElement) return;
      if (target instanceof HTMLElement && target.isContentEditable) return;

      // Ignore while a modal (guard dialog) is blocking interaction.
      if (guard !== null) return;
      if (deleteChoice !== null) return;
      if (shortcutsOpen) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (keyboardShortcuts) {
        if (e.key === "?") {
          e.preventDefault();
          setShortcutsOpen(true);
          return;
        }
        if (e.key === "j" || e.key === "k") {
          const i = deck.cards.findIndex((c) => c.id === active?.id);
          const next = deck.cards[i + (e.key === "j" ? 1 : -1)];
          if (next) dispatch({ type: "select", id: next.id });
          return;
        }
        const keyAction = KEY_ACTION.get(e.key.toLowerCase());
        if (keyAction) {
          e.preventDefault();
          commit(keyAction);
          return;
        }
      }

      const dir = KEY_DIR[e.key];
      if (dir) {
        // FIX F — don't steal arrow keys while focus is on an interactive control
        // (button row / More sheet / links). Those controls have their own
        // explicit Enter/Space activation, so dropping arrow handling is safe and
        // avoids firing a triage action the user didn't intend.
        if (
          target instanceof Element &&
          target.closest("button, a, [role=button], [role=menuitem]")
        ) {
          return;
        }
        e.preventDefault();
        commit(arrowAction(mode, dir));
        return;
      }

      if (e.key === "u" || e.key === "U") {
        e.preventDefault();
        // Undo the last action using the toast descriptor (same path as clicking
        // the Toast Undo button). No-op if there's no toast/descriptor, or if the
        // last action isn't undoable (unsub/review — FIX H3 honesty).
        if (toast?.undo && isUndoable(toast.undo.action)) {
          onUndo(toast.undo);
        }
        return;
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
    // Exhaustive: mode/guard/toast are read directly in handleKeyDown above;
    // `commit`/`onUndo` are the stable callbacks it calls, and each rebuilds
    // when ITS real dependencies change (including the active/selected card
    // for `commit` — see its useCallback above). So this effect correctly
    // re-runs on a selection change, fixing O1.
  }, [
    mode,
    guard,
    deleteChoice,
    shortcutsOpen,
    keyboardShortcuts,
    deck.cards,
    active,
    toast,
    commit,
    onUndo,
  ]);

  // ---- States --------------------------------------------------------------

  // A genuine queue fetch failure has no deck data to show — full-screen state.
  if (queue.isError) {
    return <ReconnectGmail />;
  }

  // Touch layout with a deck: feedback/Undo overlay the deck and the header is
  // a compact "N left" + Hide toggle line.
  const inDeck = !desktop && !queue.isPending && deck.cards.length > 0;

  // The deck always shows the active card on top, so a queue tap on a tablet
  // brings that card forward without reordering the queue itself.
  const deckCards = active
    ? [active, ...deck.cards.filter((c) => c.id !== active.id)]
    : deck.cards;
  const activeIndex = deck.cards.findIndex((c) => c.id === active?.id);

  // A queue card's content — shared by the queue rows and the status, which
  // shows the card the last action was taken on.
  const cardContent = (card: TriageEmail) => (
    <>
      <span className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm font-semibold">
          {card.fromName ?? card.fromEmail ?? "Unknown"}
        </span>
        <span className="tabular shrink-0 text-[0.6875rem] text-muted">
          {shortDate(card.date)}
        </span>
      </span>
      <span className="flex items-center justify-between gap-2">
        <span className="truncate text-xs">{card.subject}</span>
        <TierStamp tier={card.tier} />
      </span>
    </>
  );

  const toastNode = toast ? (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm"
    >
      {toast.card && (
        <div className="flex w-60 min-w-0 flex-col rounded-lg bg-paper px-2.5 py-2 text-left text-ink ring-1 ring-rule-strong">
          {cardContent(toast.card)}
        </div>
      )}
      <Stamp
        key={toast.undo.jobId}
        tone={ACTION_TONE[toast.undo.action]}
        animate
      >
        {ACTION_LABEL[toast.undo.action]}
      </Stamp>
      <span className="text-graphite">{toastMessage(toast)}</span>
      {isUndoable(toast.undo.action) && (
        <button
          type="button"
          aria-label="Undo last action"
          className={linkAction}
          onClick={() => onUndo(toast.undo)}
        >
          Undo
        </button>
      )}
    </div>
  ) : null;

  // Touch: one line, no card copy — it overlays the deck's bottom edge.
  const deckToast = toast ? (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-2 rounded-lg bg-paper px-2.5 py-1.5 text-sm ring-1 ring-rule-strong"
    >
      <Stamp
        key={toast.undo.jobId}
        tone={ACTION_TONE[toast.undo.action]}
        animate
      >
        {ACTION_LABEL[toast.undo.action]}
      </Stamp>
      <span className="min-w-0 truncate text-graphite">
        {toastMessage(toast)}
      </span>
      {isUndoable(toast.undo.action) && (
        <>
          <span aria-hidden className="text-muted">
            ·
          </span>
          <button
            type="button"
            aria-label="Undo last action"
            className={`shrink-0 ${linkAction}`}
            onClick={() => onUndo(toast.undo)}
          >
            Undo
          </button>
        </>
      )}
    </div>
  ) : null;

  // Shown in the same place when there is no action toast.
  const noticeNode = notice ? (
    <div
      role="status"
      aria-live="polite"
      className="rounded-lg bg-paper px-2.5 py-1.5 text-sm text-junk ring-1 ring-rule-strong"
    >
      {notice}
    </div>
  ) : null;

  const counter = (
    <QueueCounter status={status} onRetry={onRetry} onDismiss={onDismiss} />
  );

  const hideToggle = (
    <button
      type="button"
      aria-label="Hide VIP/OK listed senders"
      aria-pressed={hideListed}
      onClick={() => setMode(hideListed ? "shown" : "hidden")}
      className={`shrink-0 ${pill(hideListed)}`}
    >
      Hide VIP/OK
    </button>
  );

  const queueRows = (rowClass: string) =>
    deck.cards.map((card) => {
      const selected = card.id === active?.id;
      return (
        <li key={card.id}>
          <button
            type="button"
            aria-current={selected ? "true" : undefined}
            onClick={() => selectCard(card.id)}
            className={`w-full rounded-lg px-2.5 text-left transition-colors duration-150 ${rowClass} ${
              selected
                ? "bg-paper text-ink ring-1 ring-rule-strong"
                : "text-graphite hover:bg-paper/60"
            }`}
          >
            {cardContent(card)}
          </button>
        </li>
      );
    });

  return (
    <div className="flex h-full flex-col p-3 sm:p-4 lg:p-5">
      {/* Visually-hidden live region (DECK-2). */}
      <div aria-live="polite" className="sr-only">
        {announce}
      </div>

      {/* M1 — an action hit an expired Gmail token, or the queue paused on
          one: distinct Reconnect state, shown as a banner ABOVE the deck so the
          just-acted cards (restored by handleResult) stay visible. */}
      {(authError || status?.paused === "gmail_auth") && (
        <ReconnectGmail banner />
      )}

      {inDeck ? (
        <header className="flex min-h-11 items-center justify-between gap-3">
          <h1 className="sr-only">Triage</h1>
          <div className="flex min-w-0 flex-col">
            <span className="tabular text-sm text-muted">
              {queue.data?.counts.left} left
            </span>
            {counter}
          </div>
          {hideToggle}
        </header>
      ) : (
        <header className="mb-3 flex min-h-11 items-center gap-3">
          <h1 className="shrink-0 text-xl font-semibold text-ink">
            Triage{" "}
            {queue.data && (
              <span className="tabular font-medium text-muted">
                {queue.data.counts.left}
              </span>
            )}
          </h1>
          {counter}
          {/* Inline feedback — centered between title and chip */}
          <div className="flex min-w-0 flex-1 justify-center">{toastNode ?? noticeNode}</div>
          {hideToggle}
        </header>
      )}

      {queue.isPending ? (
        <DeckSkeleton />
      ) : deck.cards.length === 0 ? (
        <EmptyState mode={mode} onShowAll={() => setMode("shown")} />
      ) : desktop ? (
        /* ── Workbench: queue | action column | preview ── */
        <div className={`${sheet} flex min-h-0 flex-1 overflow-hidden`}>
          {/* Pane 1 — clickable queue */}
          <aside className="flex w-52 shrink-0 flex-col border-r border-rule bg-sunk lg:w-60 xl:w-72">
            <p className={`px-4 pb-1.5 pt-3 ${label}`}>Queue</p>
            <ul className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-1.5 pb-2">
              {queueRows("py-2 pointer-coarse:py-3")}
            </ul>
          </aside>

          {/* Pane 2 — action column */}
          <div className="flex w-40 shrink-0 flex-col gap-3 overflow-y-auto border-r border-rule bg-sunk p-2.5">
            {DESKTOP_GROUPS.map((group) => (
              <div
                key={group.title}
                className={`flex flex-col gap-1 ${
                  group.title === "All from this sender"
                    ? "border-t border-dashed border-rule-strong pt-3"
                    : ""
                }`}
              >
                <p className={`px-1 ${label}`}>{group.title}</p>
                {group.actions.map((a) => {
                  const key =
                    a in ACTION_KEY
                      ? ACTION_KEY[a as keyof typeof ACTION_KEY]
                      : null;
                  return (
                    <button
                      key={a}
                      type="button"
                      aria-label={ACTION_LABEL[a]}
                      disabled={!active}
                      onClick={() => commit(a)}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg border border-rule-strong bg-paper px-2.5 py-1.5 text-left text-[0.8125rem] font-bold transition-colors duration-150 hover:border-current hover:bg-current/[0.07] disabled:opacity-40 pointer-coarse:min-h-11 ${ACTION_COLOR[a]}`}
                    >
                      {ACTION_LABEL[a]}
                      {key && (
                        <kbd aria-hidden="true" className={kbd}>
                          {key.toUpperCase()}
                        </kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
            <button
              type="button"
              onClick={() => setShortcutsOpen(true)}
              className={`${btnQuiet} justify-between px-1 text-xs`}
            >
              <span className="inline-flex items-center gap-1.5">
                <Keyboard aria-hidden size={14} />
                Shortcuts
              </span>
              <kbd aria-hidden="true" className={kbd}>
                ?
              </kbd>
            </button>
          </div>

          {/* Pane 3 — preview: card header (sender/subject/badge) + iframe body */}
          <div
            ref={previewRef}
            tabIndex={-1}
            aria-label="Selected email preview"
            className="flex min-w-0 flex-1 flex-col overflow-hidden bg-paper outline-none"
          >
            {active && (
              <>
                <div className="shrink-0 border-b border-rule px-5 py-4">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-base font-semibold text-ink">
                      {active.fromName ?? active.fromEmail ?? "Unknown sender"}
                    </span>
                    <TierStamp tier={active.tier} />
                    <span className="tabular ml-auto shrink-0 text-xs text-muted">
                      {shortDate(active.date)}
                    </span>
                  </div>
                  {active.fromEmail && (
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {active.fromEmail}
                    </p>
                  )}
                  <p className="title-hand mt-2 text-lg font-semibold leading-snug text-ink">
                    {active.subject || "(no subject)"}
                  </p>
                </div>
                {/* The sender's HTML is laid on the page as a letter: white,
                    inset and capped in width, so it never floods the pane. */}
                <div className="flex min-h-0 flex-1 bg-sunk p-3 lg:p-4">
                  <iframe
                    title="Email body"
                    sandbox="allow-popups"
                    src={getBodyUrl(active.id)}
                    className="mx-auto min-h-0 w-full max-w-[760px] flex-1 rounded-md border border-rule bg-white shadow-float"
                  />
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        /* ── Touch: swipe deck (+ a tappable queue from tablet width) ── */
        <div className="flex min-h-0 flex-1 gap-4">
          {tablet && (
            <aside
              className={`${sheet} flex w-60 shrink-0 flex-col overflow-hidden bg-sunk`}
            >
              <p className={`px-4 pb-1.5 pt-3 ${label}`}>Queue</p>
              <ul className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-1.5 pb-2">
                {queueRows("min-h-12 py-2.5")}
              </ul>
            </aside>
          )}
          <div className="flex min-w-0 flex-1 flex-col">
            <Deck
              cards={deckCards}
              mode={mode}
              onAction={(a) => {
                // Touch Delete asks whether to delete this or all from the sender.
                if (a === "delete") setDeleteChoice(active ?? null);
                else commit(a);
              }}
              position={{ index: activeIndex + 1, total: deck.cards.length }}
              onNavigate={(step) => {
                const next = deck.cards[activeIndex + step];
                if (next) dispatch({ type: "select", id: next.id });
              }}
              feedback={deckToast ?? noticeNode}
            />
          </div>
        </div>
      )}

      <ShortcutsDialog
        open={shortcutsOpen}
        onOpenChange={setShortcutsOpen}
        mode={mode}
      />
      <DeleteChoiceDialog
        card={deleteChoice}
        onChoose={(a) => {
          setDeleteChoice(null);
          commit(a);
        }}
        onCancel={() => setDeleteChoice(null)}
      />
      <GuardDialog
        guard={guard}
        onConfirm={confirmGuard}
        onCancel={cancelGuard}
      />
    </div>
  );
}

// ---- Sub-states ------------------------------------------------------------

function DeckSkeleton() {
  return (
    <div
      data-testid="deck-skeleton"
      aria-label="Loading the queue"
      className="mx-auto flex w-full max-w-md flex-1 flex-col gap-3"
    >
      <div className="h-80 rounded-2xl border border-rule bg-paper p-5">
        <div className="h-4 w-1/3 rounded bg-sunk motion-safe:animate-pulse" />
        <div className="mt-2 h-3 w-1/2 rounded bg-sunk motion-safe:animate-pulse" />
        <div className="mt-6 h-4 w-4/5 rounded bg-sunk motion-safe:animate-pulse" />
        <div className="mt-2 h-3 w-full rounded bg-sunk motion-safe:animate-pulse" />
        <div className="mt-2 h-3 w-11/12 rounded bg-sunk motion-safe:animate-pulse" />
      </div>
    </div>
  );
}

function EmptyState({
  mode,
  onShowAll,
}: {
  mode: Mode;
  onShowAll: () => void;
}) {
  // DECK-4: in hidden mode an empty queue may just be filtered — offer Show all.
  // FIX H — no real hidden-count is computed, so the copy makes no numeric claim.
  if (mode === "hidden") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <p className="title-hand text-lg font-semibold text-ink">
          Nothing new from unlisted senders
        </p>
        <p className="max-w-xs text-sm text-graphite">
          Senders already on a list are hidden.
        </p>
        <button type="button" className={btnPrimary} onClick={onShowAll}>
          Show all
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
      <Stamp tone="ok" className="-rotate-3 px-3 py-1 text-sm">
        Done
      </Stamp>
      <p className="title-hand mt-2 text-lg font-semibold text-ink">
        Inbox triaged
      </p>
      <p className="max-w-xs text-sm text-graphite">
        Nothing left to triage. New mail shows up here after the next scan.
      </p>
    </div>
  );
}

function ReconnectGmail({ banner = false }: { banner?: boolean }) {
  if (banner) {
    // Compact variant: sits above the deck so the restored card stays visible.
    return (
      <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-junk/40 bg-junk/[0.06] px-4 py-2.5 text-sm">
        <span className="font-semibold text-ink">
          Reconnect Gmail — the last action was not applied.
        </span>
        <a href="/auth" className={btnPrimary}>
          Reconnect
        </a>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
      <p className="title-hand text-lg font-semibold text-ink">
        Reconnect Gmail
      </p>
      <p className="max-w-sm text-sm text-graphite">
        The Gmail connection expired. Re-authorize to continue triaging.
      </p>
      <a href="/auth" className={btnPrimary}>
        Reconnect
      </a>
    </div>
  );
}

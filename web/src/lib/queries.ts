import type { QueryKey } from "@tanstack/react-query";
import {
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { ActionResult, TriageEmail } from "./api.ts";
import { getQueue, getQueueStatus, postAction, postUndo } from "./api.ts";

// ---------------------------------------------------------------------------
// Query key factory — shared between useQueue and useAction for consistent
// cache targeting (optimistic updates hit the same entry)
// ---------------------------------------------------------------------------

interface QueueParams {
  hideListed: boolean;
  limit: number;
}

function queueKey(params: QueueParams): QueryKey {
  return ["triage", "queue", params] as const;
}

const STATUS_KEY = ["queue", "status"] as const;
const ACTION_KEY = ["triage", "action"] as const;

// ---------------------------------------------------------------------------
// useQueue — fetch the triage queue
// ---------------------------------------------------------------------------

// Stamped onto each queue response when its fetch STARTS. Only a real fetch
// produces a new stamp: optimistic `setQueryData` edits spread `prev` and carry
// it through, whereas `dataUpdatedAt` moves on those edits too. A counter, not
// Date.now(): a lift and the refetch it starts routinely share a millisecond.
let fetchSeq = 0;

export function useQueue(params: QueueParams) {
  return useQuery({
    queryKey: queueKey(params),
    queryFn: async (): Promise<QueueData> => {
      const seq = ++fetchSeq;
      return { ...(await getQueue(params)), fetchSeq: seq };
    },
  });
}

// ---------------------------------------------------------------------------
// useQueueStatus — the action queue's counter + failures. Fetched on mount (so
// jobs from before a reload show), polled every 2 s while anything is queued.
// ---------------------------------------------------------------------------

export function useQueueStatus() {
  return useQuery({
    queryKey: STATUS_KEY,
    queryFn: getQueueStatus,
    refetchInterval: (q) => ((q.state.data?.actions ?? 0) > 0 ? 2000 : false),
  });
}

/** True while any triage action's enqueue request is awaiting its response. */
export function useActionInFlight(): boolean {
  return useIsMutating({ mutationKey: ACTION_KEY }) > 0;
}

// ---------------------------------------------------------------------------
// useAction — enqueue a triage action with optimistic queue removal
// ---------------------------------------------------------------------------

interface ActionPayload {
  id: string;
  action: Parameters<typeof postAction>[0]["action"];
  fromEmail: string | null;
  fromName: string | null;
  unsubUrl?: string | null;
  unsubPost?: string | null;
  confirmed?: boolean;
  /** Every queue card this action covers, removed from the cache at once. */
  coveredIds: string[];
  /** Queue params to target for optimistic update */
  queueParams: QueueParams;
}

// Client-side shape: `fetchSeq` is added by useQueue, not sent by the server.
type QueueData = {
  emails: TriageEmail[];
  counts: { left: number };
  fetchSeq?: number;
};
type Removed = { email: TriageEmail; index: number }[];

export function useAction() {
  const queryClient = useQueryClient();

  // Put back exactly the entries this action removed, into the CURRENT cache
  // value. Never a whole snapshot: with concurrent actions a snapshot still
  // holds the other actions' cards and would resurrect them.
  function putBack(key: QueryKey, removed: Removed) {
    queryClient.setQueryData<QueueData>(key, (prev) => {
      if (!prev) return prev;
      const present = new Set(prev.emails.map((e) => e.id));
      const back = removed.filter((r) => !present.has(r.email.id));
      const emails = [...prev.emails];
      for (const { email, index } of back) {
        emails.splice(Math.min(index, emails.length), 0, email);
      }
      return { ...prev, emails, counts: { left: prev.counts.left + back.length } };
    });
  }

  return useMutation({
    mutationKey: ACTION_KEY,
    mutationFn: ({
      queueParams: _qp,
      coveredIds: _ids,
      ...payload
    }: ActionPayload): Promise<ActionResult> => postAction(payload),

    // No cancelQueries here: it would cancel the low-water refetch on every
    // click and leave the deck draining to empty.
    onMutate: ({ coveredIds, queueParams }) => {
      const key = queueKey(queueParams);
      const ids = new Set(coveredIds);
      let removed: Removed = [];
      queryClient.setQueryData<QueueData>(key, (prev) => {
        if (!prev) return prev;
        removed = prev.emails
          .map((email, index) => ({ email, index }))
          .filter((r) => ids.has(r.email.id));
        return {
          ...prev,
          emails: prev.emails.filter((e) => !ids.has(e.id)),
          counts: { left: Math.max(0, prev.counts.left - removed.length) },
        };
      });
      return { key, removed };
    },

    onError: (_err, _vars, context) => {
      if (context) putBack(context.key, context.removed);
    },

    // Guard and auth-error results arrive as RESOLVED values (ok:false), so
    // onError never fires for them; roll back here too. A queued action leaves
    // the removal standing and does NOT refetch the deck — the server excludes
    // the job's mail from the queue on its own.
    onSuccess: (result, _vars, context) => {
      if (!result.ok) {
        putBack(context.key, context.removed);
        return;
      }
      void queryClient.invalidateQueries({ queryKey: STATUS_KEY });
    },
  });
}

// ---------------------------------------------------------------------------
// useUndo — undo a queued action by job id; refetches the deck so the server
// decides what comes back, and the status so the counter moves
// ---------------------------------------------------------------------------

export function useUndo(queueParams: QueueParams) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: { jobId: string }) => postUndo(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queueKey(queueParams) });
      void queryClient.invalidateQueries({ queryKey: STATUS_KEY });
    },
  });
}

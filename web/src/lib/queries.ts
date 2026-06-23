import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { QueryKey } from '@tanstack/react-query'
import { getQueue, postAction, postUndo } from './api.ts'
import type { TriageEmail, ActionResult } from './api.ts'

// ---------------------------------------------------------------------------
// Query key factory — shared between useQueue and useAction for consistent
// cache targeting (optimistic updates hit the same entry)
// ---------------------------------------------------------------------------

interface QueueParams {
  hideListed: boolean
  limit: number
}

function queueKey(params: QueueParams): QueryKey {
  return ['triage', 'queue', params] as const
}

// ---------------------------------------------------------------------------
// useQueue — fetch the triage queue
// ---------------------------------------------------------------------------

export function useQueue(params: QueueParams) {
  return useQuery({
    queryKey: queueKey(params),
    queryFn: () => getQueue(params),
  })
}

// ---------------------------------------------------------------------------
// useAction — perform a triage action with optimistic queue removal
// ---------------------------------------------------------------------------

interface ActionPayload {
  id: string
  action: Parameters<typeof postAction>[0]['action']
  fromEmail: string | null
  fromName: string | null
  unsubUrl?: string | null
  unsubPost?: string | null
  confirmed?: boolean
  /** Queue params to target for optimistic update */
  queueParams: QueueParams
}

type QueueData = { emails: TriageEmail[]; counts: { left: number } }

export function useAction() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ queueParams: _qp, ...payload }: ActionPayload): Promise<ActionResult> =>
      postAction(payload),

    onMutate: async ({ id, queueParams }) => {
      const key = queueKey(queueParams)

      // Cancel any in-flight refetches so they don't overwrite our optimistic state
      await queryClient.cancelQueries({ queryKey: key })

      // Snapshot prior state for rollback
      const snapshot = queryClient.getQueryData<QueueData>(key)

      // Optimistically remove the acted email from the queue
      queryClient.setQueryData<QueueData>(key, (prev) => {
        if (!prev) return prev
        return {
          ...prev,
          emails: prev.emails.filter((e) => e.id !== id),
          counts: { left: Math.max(0, prev.counts.left - 1) },
        }
      })

      return { snapshot, key }
    },

    onError: (_err, _vars, context) => {
      // Roll back to snapshot on error
      if (context?.snapshot !== undefined) {
        queryClient.setQueryData(context.key, context.snapshot)
      }
    },

    // Guard and auth-error results arrive here (they are resolved values, not errors).
    // The caller receives them via mutation.data and can inspect result.ok / result.guard / result.error.
    // No action needed in onSuccess — the optimistic removal already stands.
    // We don't force-invalidate here so the deck doesn't jump while the user is reading a guard dialog.
  })
}

// ---------------------------------------------------------------------------
// useUndo — undo a previous action; invalidates the queue so the restored
// email can reappear
// ---------------------------------------------------------------------------

export function useUndo(queueParams: QueueParams) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: postUndo,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queueKey(queueParams) })
    },
  })
}

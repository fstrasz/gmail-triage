import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryKey } from '@tanstack/react-query'
import {
  getLists,
  addSender,
  removeSender,
  resetBlocklist,
  createBackup,
  addRule,
  updateRule,
  toggleRule,
  deleteRule,
} from './listsApi.ts'

const listsKey: QueryKey = ['lists']

// ---- Read ------------------------------------------------------------------

export function useLists() {
  return useQuery({ queryKey: listsKey, queryFn: getLists })
}

// ---- Mutations (invalidate ['lists'] on success) ---------------------------
// None are optimistic: a list edit re-derives the merged view, and the read is
// cheap, so a plain invalidate is simpler and correct.

function useInvalidatingMutation<TVars>(fn: (vars: TVars) => Promise<unknown>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: listsKey })
    },
  })
}

export function useAddSender() {
  return useInvalidatingMutation(addSender)
}

export function useRemoveSender() {
  return useInvalidatingMutation(removeSender)
}

export function useResetBlocklist() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: resetBlocklist,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: listsKey })
    },
  })
}

export function useCreateBackup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createBackup,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: listsKey })
    },
  })
}

export function useAddRule() {
  return useInvalidatingMutation(addRule)
}

export function useUpdateRule() {
  return useInvalidatingMutation(updateRule)
}

export function useToggleRule() {
  return useInvalidatingMutation(toggleRule)
}

export function useDeleteRule() {
  return useInvalidatingMutation(deleteRule)
}

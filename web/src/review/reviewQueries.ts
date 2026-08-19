import type { QueryKey } from "@tanstack/react-query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReviewAction, ReviewEvent } from "./reviewApi.ts";
import { addCalendar, dismiss, execute, getReview } from "./reviewApi.ts";

// Single query key for the review list; all mutations invalidate it on success.
const reviewKey: QueryKey = ["review"];

export function useReview() {
  return useQuery({ queryKey: reviewKey, queryFn: getReview });
}

export function useExecute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: ReviewAction }) =>
      execute(id, action),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: reviewKey });
    },
  });
}

export function useCalendar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      eventIndex,
      event,
    }: {
      id: string;
      eventIndex: number;
      event: ReviewEvent;
    }) => addCalendar(id, eventIndex, event),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: reviewKey });
    },
  });
}

export function useDismiss() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => dismiss(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: reviewKey });
    },
  });
}

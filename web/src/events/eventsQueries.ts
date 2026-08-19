import type { QueryKey } from "@tanstack/react-query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CalendarEventInput, EventsData } from "./eventsApi.ts";
import {
  addToCalendar,
  getEvents,
  ignoreEvent,
  resetRebuild,
  searchNow,
  sendEventsEmail,
} from "./eventsApi.ts";

// ---------------------------------------------------------------------------
// Query key — the whole events view is a single cached resource.
// ---------------------------------------------------------------------------

const eventsKey: QueryKey = ["events"];

// ---------------------------------------------------------------------------
// useEvents — fetch the grouped events view.
// ---------------------------------------------------------------------------

export function useEvents() {
  return useQuery({ queryKey: eventsKey, queryFn: getEvents });
}

// ---------------------------------------------------------------------------
// useIgnoreEvent — optimistic remove; no invalidate (server just marks it).
// ---------------------------------------------------------------------------

export function useIgnoreEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ignoreEvent,
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: eventsKey });
      const snapshot = queryClient.getQueryData<EventsData>(eventsKey);
      queryClient.setQueryData<EventsData>(eventsKey, (prev) => {
        if (!prev) return prev;
        const groups = prev.groups
          .map((g) => ({ ...g, events: g.events.filter((e) => e.id !== id) }))
          .filter((g) => g.events.length > 0);
        return { ...prev, groups };
      });
      return { snapshot };
    },
    onError: (_err, _id, context) => {
      if (context?.snapshot !== undefined) {
        queryClient.setQueryData(eventsKey, context.snapshot);
      }
    },
  });
}

// ---------------------------------------------------------------------------
// useAddToCalendar — invalidate on success so the "Added to Calendar" link
// appears. Auth failures resolve as ok:false data (caller inspects the result).
// ---------------------------------------------------------------------------

export function useAddToCalendar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (vars: { id: string; event: CalendarEventInput }) =>
      addToCalendar(vars.id, vars.event),
    onSuccess: (result) => {
      if (result.ok)
        void queryClient.invalidateQueries({ queryKey: eventsKey });
    },
  });
}

// ---------------------------------------------------------------------------
// useSearchNow / useSendEmail / useResetRebuild — refetch the view on success.
// ---------------------------------------------------------------------------

export function useSearchNow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => searchNow(),
    onSuccess: (result) => {
      if (result.ok)
        void queryClient.invalidateQueries({ queryKey: eventsKey });
    },
  });
}

export function useSendEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => sendEventsEmail(),
    onSuccess: (result) => {
      if (result.ok)
        void queryClient.invalidateQueries({ queryKey: eventsKey });
    },
  });
}

export function useResetRebuild() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => resetRebuild(),
    onSuccess: (result) => {
      if (result.ok)
        void queryClient.invalidateQueries({ queryKey: eventsKey });
    },
  });
}

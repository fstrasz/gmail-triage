import { useQuery } from "@tanstack/react-query";
import type { LabeledTier } from "./labeledApi.ts";
import { getLabeled } from "./labeledApi.ts";

/**
 * getLabeled can issue up to 200 parallel Gmail messages.get calls per load
 * (one per labeled message). staleTime keeps a switch back to a previously
 * viewed tab from refetching, and refetchOnWindowFocus is disabled so
 * tabbing away and back doesn't silently re-trigger that cost — TanStack
 * Query's default would multiply it every time the operator returns to the
 * app.
 */
export function useLabeled(label: LabeledTier) {
  return useQuery({
    queryKey: ["labeled", label],
    queryFn: () => getLabeled(label),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

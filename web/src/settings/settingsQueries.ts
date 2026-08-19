import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "./settingsApi.ts";

// ---------------------------------------------------------------------------
// Query key + read hook
// ---------------------------------------------------------------------------

const SETTINGS_KEY = ["settings"] as const;

export function useSettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: api.getSettings,
  });
}

// ---------------------------------------------------------------------------
// Mutation hooks — each invalidates ['settings'] on success so the page
// re-reads the authoritative server state (no local optimistic layer needed
// for a settings form).
// ---------------------------------------------------------------------------

function useInvalidatingMutation<TVars = void, TData = unknown>(
  mutationFn: (vars: TVars) => Promise<TData>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: SETTINGS_KEY });
    },
  });
}

export const useSetScheduler = () => useInvalidatingMutation(api.setScheduler);
export const useSetDailySummary = () =>
  useInvalidatingMutation(api.setDailySummary);
export const useSetDailySummarySchedule = () =>
  useInvalidatingMutation(api.setDailySummarySchedule);
export const useSetEventsSearch = () =>
  useInvalidatingMutation(api.setEventsSearch);
export const useSetTimezone = () => useInvalidatingMutation(api.setTimezone);
export const useSetListsViewMode = () =>
  useInvalidatingMutation(api.setListsViewMode);
export const useSetBulkGuardThreshold = () =>
  useInvalidatingMutation(api.setBulkGuardThreshold);
export const useAddLocation = () => useInvalidatingMutation(api.addLocation);
export const useRemoveLocation = () =>
  useInvalidatingMutation(api.removeLocation);
export const useAddInterest = () =>
  useInvalidatingMutation(api.addEventInterest);
export const useRemoveInterest = () =>
  useInvalidatingMutation(api.removeEventInterest);
export const useEditInterest = () =>
  useInvalidatingMutation(api.editEventInterest);
export const useRunScan = () => useInvalidatingMutation(api.runScan);
export const useRestoreBlocklistBackup = () =>
  useInvalidatingMutation(api.restoreBlocklistBackup);
export const useRestoreNamedBackup = () =>
  useInvalidatingMutation(api.restoreNamedBackup);
export const useDeleteNamedBackup = () =>
  useInvalidatingMutation(api.deleteNamedBackup);

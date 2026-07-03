import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { SettingsResponse } from './settingsApi.ts'

// ---------------------------------------------------------------------------
// Mock the feature's query/mutation hooks so the page renders without a
// backend or a QueryClientProvider. Mirrors web/src/test/deckui.test.tsx.
// ---------------------------------------------------------------------------

const settingsState: { data: SettingsResponse | undefined; isPending: boolean; isError: boolean } = {
  data: undefined,
  isPending: false,
  isError: false,
}

const displayMutate = vi.fn()
const addLocationMutate = vi.fn()
const bulkGuardMutate = vi.fn()

const genericMut = () => ({ mutate: vi.fn(), isPending: false, data: undefined })

vi.mock('./settingsQueries.ts', () => ({
  useSettings: () => settingsState,
  useSetListsViewMode: () => ({ mutate: displayMutate, isPending: false }),
  useAddLocation: () => ({ mutate: addLocationMutate, isPending: false }),
  useSetBulkGuardThreshold: () => ({ mutate: bulkGuardMutate, isPending: false }),
  useRemoveLocation: () => genericMut(),
  useAddInterest: () => genericMut(),
  useRemoveInterest: () => genericMut(),
  useEditInterest: () => genericMut(),
  useSetScheduler: () => genericMut(),
  useRunScan: () => genericMut(),
  useSetDailySummary: () => genericMut(),
  useSetDailySummarySchedule: () => genericMut(),
  useSetEventsSearch: () => genericMut(),
  useSetTimezone: () => genericMut(),
  useRestoreBlocklistBackup: () => genericMut(),
  useRestoreNamedBackup: () => genericMut(),
  useDeleteNamedBackup: () => genericMut(),
}))

// Import AFTER the mock is registered.
import { SettingsPage } from './SettingsPage.tsx'

function makeResponse(over: Partial<SettingsResponse> = {}): SettingsResponse {
  return {
    ok: true,
    settings: {
      locations: ['Las Vegas, NV'],
      timezone: 'America/New_York',
      schedulerEnabled: true,
      schedulerStartHour: 10,
      schedulerStartMinute: 0,
      schedulerIntervalHours: 2,
      dailySummaryEnabled: false,
      dailySummaryEmail: '',
      dailySummaryHour: 6,
      dailySummaryMinute: 0,
      dailySummaryIntervalUnit: 'days',
      dailySummaryIntervalValue: 1,
      dailySummaryLastSentAt: null,
      listsViewMode: 'table',
      eventInterests: ['wine dinners'],
      eventsSearchEnabled: false,
      eventsSearchEmail: null,
      eventsSearchIntervalDays: 7,
      eventsSearchLastRunAt: null,
      schedulerLastRunAt: null,
      bulkGuardThreshold: 250,
    },
    activityLog: [
      { ts: '2026-06-30T12:00:00Z', type: 'triage', action: 'ok', sender: 'a@b.com', senderName: 'A', count: 3 },
    ],
    backups: { single: null, named: [] },
    stats: { kept: 1, cleaned: 2, junked: 3, unsubbed: 4, vip: 5, ok: 6 },
    bulkGuardThreshold: 250,
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  settingsState.data = makeResponse()
  settingsState.isPending = false
  settingsState.isError = false
})

describe('SettingsPage', () => {
  test('shows a skeleton while loading', () => {
    settingsState.data = undefined
    settingsState.isPending = true
    render(<SettingsPage />)
    expect(screen.getByTestId('settings-skeleton')).toBeInTheDocument()
  })

  test('shows a reconnect/error state on isError', () => {
    settingsState.data = undefined
    settingsState.isError = true
    render(<SettingsPage />)
    expect(screen.getByText(/load settings/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /reconnect/i })).toBeInTheDocument()
  })

  test('renders settings data (locations, effective threshold, activity log)', () => {
    render(<SettingsPage />)
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByText('Las Vegas, NV')).toBeInTheDocument()
    expect(screen.getByText('wine dinners')).toBeInTheDocument()
    // Effective bulk-guard threshold value is surfaced.
    expect(screen.getByText('250')).toBeInTheDocument()
    // Activity log row present.
    expect(screen.getByText(/a@b\.com|^A$/)).toBeInTheDocument()
    // Timezone select reflects the current value.
    const tz = screen.getByLabelText('Timezone') as HTMLSelectElement
    expect(tz.value).toBe('America/New_York')
  })

  test('changing the Display view mode fires the setListsViewMode mutation', () => {
    render(<SettingsPage />)
    const select = screen.getByLabelText(/lists view mode/i)
    fireEvent.change(select, { target: { value: 'compact' } })
    expect(displayMutate).toHaveBeenCalledTimes(1)
    expect(displayMutate).toHaveBeenCalledWith('compact')
  })

  test('adding a location fires the addLocation mutation with the typed value', () => {
    render(<SettingsPage />)
    const input = screen.getByLabelText('New location')
    fireEvent.change(input, { target: { value: 'Reno, NV' } })
    fireEvent.submit(input.closest('form')!)
    expect(addLocationMutate).toHaveBeenCalledWith('Reno, NV')
  })

  test('saving the bulk-guard threshold fires the mutation with the numeric value', () => {
    render(<SettingsPage />)
    const input = screen.getByLabelText('Bulk-guard threshold')
    fireEvent.change(input, { target: { value: '500' } })
    fireEvent.submit(input.closest('form')!)
    expect(bulkGuardMutate).toHaveBeenCalledWith(500)
  })
})

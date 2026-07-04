import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { EventItem, EventsData } from './eventsApi.ts'

// ---------------------------------------------------------------------------
// Mock the feature query hooks so EventsPage renders without a backend.
// ---------------------------------------------------------------------------

interface EventsHookState {
  data: EventsData | undefined
  isPending: boolean
  isError: boolean
  isSuccess: boolean
  dataUpdatedAt: number
}

const hookState: { events: EventsHookState } = {
  events: { data: undefined, isPending: false, isError: false, isSuccess: true, dataUpdatedAt: 1 },
}

const ignoreMutate = vi.fn()
const searchMutate = vi.fn()
const sendEmailMutate = vi.fn()
const resetMutate = vi.fn()
const addCalMutateAsync = vi.fn().mockResolvedValue({ ok: true, url: 'https://cal/x' })

vi.mock('./eventsQueries.ts', () => ({
  useEvents: () => hookState.events,
  useIgnoreEvent: () => ({ mutate: ignoreMutate, isPending: false }),
  useAddToCalendar: () => ({ mutate: vi.fn(), mutateAsync: addCalMutateAsync, isPending: false }),
  useSearchNow: () => ({ mutate: searchMutate, isPending: false }),
  useSendEmail: () => ({ mutate: sendEmailMutate, isPending: false }),
  useResetRebuild: () => ({ mutate: resetMutate, isPending: false }),
}))

// Import AFTER the mock is registered.
import { EventsPage } from './EventsPage.tsx'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(id: string, over: Partial<EventItem> = {}): EventItem {
  return {
    id,
    title: `Title ${id}`,
    date: '2026-07-01',
    time: '18:00',
    location: 'Somewhere',
    url: `https://example.com/${id}`,
    canonicalUrl: null,
    description: `Desc ${id}`,
    interest: 'wine',
    rating: null,
    pricePerPerson: null,
    source: 'email',
    calendarEventUrl: null,
    ...over,
  }
}

function loaded(groups: EventsData['groups'], over: Partial<EventsData> = {}): void {
  hookState.events = {
    data: { ok: true, groups, lastRunAt: '2026-06-28T10:00:00Z', interests: ['wine'], hasInterests: true, ...over },
    isPending: false,
    isError: false,
    isSuccess: true,
    dataUpdatedAt: 1,
  }
}

function renderPage() {
  return render(
    <MemoryRouter basename="/app" initialEntries={['/app/events']}>
      <EventsPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  loaded([{ location: 'Las Vegas, NV', events: [makeEvent('e1')] }])
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EventsPage', () => {
  test('1. loading state shows a skeleton', () => {
    hookState.events = { data: undefined, isPending: true, isError: false, isSuccess: false, dataUpdatedAt: 0 }
    renderPage()
    expect(screen.getByTestId('events-skeleton')).toBeInTheDocument()
  })

  test('2. fetch error shows the Reconnect Gmail state', () => {
    hookState.events = { data: undefined, isPending: false, isError: true, isSuccess: false, dataUpdatedAt: 0 }
    renderPage()
    expect(screen.getByText(/reconnect gmail/i)).toBeInTheDocument()
  })

  test('3. empty (no groups) shows the empty state', () => {
    loaded([])
    renderPage()
    expect(screen.getByText(/no upcoming events found/i)).toBeInTheDocument()
  })

  test('4. data renders the location heading and event title link', () => {
    renderPage()
    expect(screen.getByText(/las vegas, nv/i)).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /title e1/i })
    expect(link).toHaveAttribute('href', 'https://example.com/e1')
  })

  test('5. no-interests banner links to Settings', () => {
    loaded([{ location: 'Las Vegas, NV', events: [makeEvent('e1')] }], { hasInterests: false })
    renderPage()
    const link = screen.getByRole('link', { name: /add some in settings/i })
    expect(link).toHaveAttribute('href', '/app/settings')
  })

  test('6. Ignore calls the ignore mutation with the event id', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /ignore/i }))
    expect(ignoreMutate).toHaveBeenCalledTimes(1)
    expect(ignoreMutate.mock.calls[0][0]).toBe('e1')
  })

  test('7. Search Now calls the search mutation', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /search now/i }))
    expect(searchMutate).toHaveBeenCalledTimes(1)
  })

  test('8. canonicalUrl wins over url for the title link', () => {
    loaded([
      { location: 'Reno, NV', events: [makeEvent('e2', { canonicalUrl: 'https://canon/e2' })] },
    ])
    renderPage()
    const link = screen.getByRole('link', { name: /title e2/i })
    expect(link).toHaveAttribute('href', 'https://canon/e2')
  })

  test('9. Reset & Rebuild requires a confirm step before firing (destructive)', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /reset & rebuild/i }))
    // First click only reveals the confirm — the destructive mutation has NOT fired.
    expect(resetMutate).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }))
    expect(resetMutate).toHaveBeenCalledTimes(1)
  })
})

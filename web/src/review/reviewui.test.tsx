import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ReviewItem } from './reviewApi.ts'

// ---------------------------------------------------------------------------
// Mock the feature query hooks so the page renders without a backend.
// ---------------------------------------------------------------------------

interface ReviewState {
  data: ReviewItem[] | undefined
  isPending: boolean
  isError: boolean
}

const hookState: { review: ReviewState } = {
  review: { data: [], isPending: false, isError: false },
}

const executeMutate = vi.fn()
const calendarMutate = vi.fn()
const dismissMutate = vi.fn()

vi.mock('./reviewQueries.ts', () => ({
  useReview: () => hookState.review,
  useExecute: () => ({ mutate: executeMutate, isPending: false }),
  useCalendar: () => ({ mutate: calendarMutate, isPending: false }),
  useDismiss: () => ({ mutate: dismissMutate, isPending: false }),
}))

// Import AFTER the mock is registered.
import { ReviewPage } from './ReviewPage.tsx'

function makeItem(id: string, over: Partial<ReviewItem> = {}): ReviewItem {
  return {
    id,
    subject: `Subject ${id}`,
    from: `Sender ${id} <${id}@example.com>`,
    date: '2026-07-01T12:00:00Z',
    analyzedAt: '2026-07-01T12:05:00Z',
    status: 'pending',
    analysis: {
      summary: `Summary ${id}`,
      action: 'archive',
      actionReason: `Reason ${id}`,
      isLocalEvent: false,
      events: [],
      draftReply: null,
      ...(over.analysis ?? {}),
    },
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  hookState.review = { data: [makeItem('p1')], isPending: false, isError: false }
})

describe('ReviewPage', () => {
  test('loading state shows a skeleton', () => {
    hookState.review = { data: undefined, isPending: true, isError: false }
    render(<ReviewPage />)
    expect(screen.getByTestId('review-skeleton')).toBeInTheDocument()
  })

  test('error state shows the Reconnect Gmail affordance', () => {
    hookState.review = { data: undefined, isPending: false, isError: true }
    render(<ReviewPage />)
    expect(screen.getByText(/reconnect gmail/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /reconnect/i })).toHaveAttribute('href', '/auth')
  })

  test('empty state (no items) shows the empty message', () => {
    hookState.review = { data: [], isPending: false, isError: false }
    render(<ReviewPage />)
    expect(screen.getByText(/nothing to review/i)).toBeInTheDocument()
  })

  test('splits pending vs executed, showing both section headers with a ✓ on executed', () => {
    hookState.review = {
      data: [
        makeItem('p1'),
        makeItem('x1', { status: 'executed', executedAction: 'keep' }),
      ],
      isPending: false,
      isError: false,
    }
    render(<ReviewPage />)
    expect(screen.getByText('Pending')).toBeInTheDocument()
    expect(screen.getByText('Executed')).toBeInTheDocument()
    // Executed row carries the ✓ marker.
    expect(screen.getByLabelText('Executed')).toBeInTheDocument()
  })

  test('selecting a pending row then clicking Archive calls execute.mutate with {id,action}', () => {
    render(<ReviewPage />)
    // Mobile (jsdom → no matchMedia): tap the row to open the detail view.
    fireEvent.click(screen.getByText('Subject p1'))
    fireEvent.click(screen.getByRole('button', { name: /^Archive$/ }))
    expect(executeMutate).toHaveBeenCalledTimes(1)
    expect(executeMutate.mock.calls[0][0]).toEqual({ id: 'p1', action: 'archive' })
  })

  test('an event with no calendar link renders an editable form that calls calendar.mutate on submit', () => {
    hookState.review = {
      data: [
        makeItem('p1', {
          analysis: {
            summary: 'S',
            action: 'none',
            actionReason: 'R',
            isLocalEvent: true,
            draftReply: null,
            events: [
              { title: 'Wine dinner', date: '2026-07-10', time: '18:00', location: 'LV', description: 'd', url: null },
            ],
          },
        }),
      ],
      isPending: false,
      isError: false,
    }
    render(<ReviewPage />)
    fireEvent.click(screen.getByText('Subject p1'))
    const form = screen.getByLabelText('Event title').closest('form') as HTMLFormElement
    fireEvent.submit(form)
    expect(calendarMutate).toHaveBeenCalledTimes(1)
    const arg = calendarMutate.mock.calls[0][0] as { id: string; eventIndex: number }
    expect(arg.id).toBe('p1')
    expect(arg.eventIndex).toBe(0)
  })

  test('an item whose analysis is missing the events array does not crash the page', () => {
    const bad = makeItem('p1')
    // Simulate malformed model output: the events array is absent entirely.
    delete (bad.analysis as { events?: unknown }).events
    hookState.review = { data: [bad], isPending: false, isError: false }
    render(<ReviewPage />)
    fireEvent.click(screen.getByText('Subject p1'))
    // Detail still renders (guarded events access), no throw.
    expect(screen.getByText('Summary p1')).toBeInTheDocument()
  })

  test('an existing calendar link shows "Open in Calendar" instead of the form', () => {
    hookState.review = {
      data: [
        makeItem('p1', {
          calendarLinks: { '0': 'https://cal/abc' },
          analysis: {
            summary: 'S',
            action: 'none',
            actionReason: 'R',
            isLocalEvent: true,
            draftReply: null,
            events: [
              { title: 'Wine dinner', date: '2026-07-10', time: '18:00', location: 'LV', description: 'd', url: null },
            ],
          },
        }),
      ],
      isPending: false,
      isError: false,
    }
    render(<ReviewPage />)
    fireEvent.click(screen.getByText('Subject p1'))
    const link = screen.getByRole('link', { name: /open in calendar/i })
    expect(link).toHaveAttribute('href', 'https://cal/abc')
    expect(screen.queryByLabelText('Event title')).not.toBeInTheDocument()
  })
})

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

// ---------------------------------------------------------------------------
// Real QueryClientProvider so useLabeled's real staleTime/query-key behavior
// runs; only the network boundary (global fetch) is mocked, so switching
// tiers can be asserted against the actual URL the mock received.
// ---------------------------------------------------------------------------

import { LabeledPage } from '../labeled/LabeledPage.tsx'

function renderWithClient(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

function jsonRes(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('LabeledPage', () => {
  test('renders rows for a ..VIP payload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonRes(200, {
          ok: true,
          label: '..VIP',
          items: [
            { id: '1', subject: 'Hello', from: 'Alice <alice@example.com>', date: '2026-06-01', snippet: 'hi there', isRead: true },
          ],
        }),
      ),
    )

    renderWithClient(<LabeledPage />)

    await screen.findByText('Hello')
    expect(screen.getByText('Alice <alice@example.com>')).toBeInTheDocument()
    expect(screen.getByText('hi there')).toBeInTheDocument()
  })

  test('switching to Blocked refetches with the new label in the query string', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      const label = new URL(url, 'http://localhost').searchParams.get('label')
      return Promise.resolve(
        jsonRes(200, {
          ok: true,
          label,
          items: [{ id: label, subject: `Subject for ${label}`, from: 'x@example.com', date: '2026-06-01', snippet: 's', isRead: true }],
        }),
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    renderWithClient(<LabeledPage />)
    await screen.findByText('Subject for ..VIP')

    fireEvent.click(screen.getByRole('button', { name: 'Blocked' }))

    await screen.findByText('Subject for .DelPend')

    const lastUrl = fetchMock.mock.calls.at(-1)![0] as string
    expect(new URL(lastUrl, 'http://localhost').searchParams.get('label')).toBe('.DelPend')
  })

  test('a non-ok response renders the error state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonRes(400, { ok: false })))

    renderWithClient(<LabeledPage />)

    await waitFor(() => {
      expect(screen.getByTestId('labeled-error')).toBeInTheDocument()
    })
  })
})

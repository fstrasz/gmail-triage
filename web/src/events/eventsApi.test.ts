import { describe, test, expect, vi, beforeEach } from 'vitest'
import type { CalendarEventInput } from './eventsApi.ts'
import {
  getEvents,
  ignoreEvent,
  addToCalendar,
  searchNow,
  sendEventsEmail,
  resetRebuild,
} from './eventsApi.ts'

function mockFetch(status: number, body: unknown): void {
  globalThis.fetch = vi.fn().mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response)
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('getEvents', () => {
  test('GETs /api/events and returns the parsed body', async () => {
    const payload = { ok: true, groups: [], lastRunAt: null, interests: [], hasInterests: false }
    mockFetch(200, payload)

    const result = await getEvents()

    expect(fetch).toHaveBeenCalledWith('/api/events')
    expect(result).toEqual(payload)
  })

  test('throws on non-2xx', async () => {
    mockFetch(500, { message: 'boom' })
    await expect(getEvents()).rejects.toThrow()
  })
})

describe('ignoreEvent', () => {
  test('POSTs {id} to /api/events/ignore', async () => {
    mockFetch(200, { ok: true })

    await ignoreEvent('ev-1')

    expect(fetch).toHaveBeenCalledWith('/api/events/ignore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'ev-1' }),
    })
  })
})

describe('addToCalendar', () => {
  const input: CalendarEventInput = {
    title: 'Wine Dinner',
    date: '2026-07-01',
    time: '18:00',
    location: 'Las Vegas, NV',
    description: 'A tasting',
    url: 'https://example.com/e',
  }

  test('POSTs {id, event} to /api/events/calendar and returns {ok,url}', async () => {
    mockFetch(200, { ok: true, url: 'https://cal/x' })

    const result = await addToCalendar('ev-2', input)

    expect(fetch).toHaveBeenCalledWith('/api/events/calendar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'ev-2', event: input }),
    })
    expect(result).toEqual({ ok: true, url: 'https://cal/x' })
  })

  test('resolves 503 {error:gmail_auth} as data (does not throw)', async () => {
    mockFetch(503, { error: 'gmail_auth' })

    const result = await addToCalendar('ev-3', input)

    expect(result).toEqual({ ok: false, error: 'gmail_auth' })
  })
})

describe('searchNow', () => {
  test('POSTs /api/events/search and returns {ok, added}', async () => {
    mockFetch(200, { ok: true, added: 4 })

    const result = await searchNow()

    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    const opts = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1] as { method: string }
    expect(url).toBe('/api/events/search')
    expect(opts.method).toBe('POST')
    expect(result).toEqual({ ok: true, added: 4 })
  })

  test('resolves 503 auth as data', async () => {
    mockFetch(503, { error: 'gmail_auth' })
    const result = await searchNow()
    expect(result).toEqual({ ok: false, error: 'gmail_auth' })
  })
})

describe('sendEventsEmail / resetRebuild', () => {
  test('sendEventsEmail POSTs /api/events/send-email', async () => {
    mockFetch(200, { ok: true })
    await sendEventsEmail()
    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toBe('/api/events/send-email')
  })

  test('resetRebuild POSTs /api/events/reset-rebuild and returns {ok, added}', async () => {
    mockFetch(200, { ok: true, added: 12 })
    const result = await resetRebuild()
    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toBe('/api/events/reset-rebuild')
    expect(result).toEqual({ ok: true, added: 12 })
  })
})

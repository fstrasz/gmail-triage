import { describe, test, expect, vi, beforeEach } from 'vitest'
import {
  getSettings,
  setScheduler,
  setBulkGuardThreshold,
  addLocation,
  runScan,
} from './settingsApi.ts'

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

describe('getSettings', () => {
  test('GETs /api/settings and returns the parsed response', async () => {
    const payload = {
      ok: true,
      settings: { locations: ['Las Vegas, NV'] },
      activityLog: [],
      backups: { single: null, named: [] },
      stats: { kept: 0, cleaned: 0, junked: 0, unsubbed: 0, vip: 0, ok: 0 },
      bulkGuardThreshold: 100,
    }
    mockFetch(200, payload)

    const res = await getSettings()

    expect(fetch).toHaveBeenCalledWith('/api/settings')
    expect(res).toEqual(payload)
  })
})

describe('setScheduler', () => {
  test('POSTs the scheduler payload with the correct URL/method/body', async () => {
    mockFetch(200, { ok: true })

    await setScheduler({ enabled: true, startHour: 10, startMinute: 30, intervalHours: 2 })

    expect(fetch).toHaveBeenCalledWith('/api/settings/scheduler', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true, startHour: 10, startMinute: 30, intervalHours: 2 }),
    })
  })
})

describe('setBulkGuardThreshold', () => {
  test('POSTs {threshold} and returns {ok,threshold}', async () => {
    mockFetch(200, { ok: true, threshold: 250 })

    const res = await setBulkGuardThreshold(250)

    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[0]).toBe('/api/settings/bulk-guard-threshold')
    expect(JSON.parse(call[1].body as string)).toEqual({ threshold: 250 })
    expect(res).toEqual({ ok: true, threshold: 250 })
  })
})

describe('addLocation', () => {
  test('POSTs {location} to the add endpoint', async () => {
    mockFetch(200, { ok: true })

    await addLocation('Reno, NV')

    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[0]).toBe('/api/settings/locations/add')
    expect(JSON.parse(call[1].body as string)).toEqual({ location: 'Reno, NV' })
  })
})

describe('runScan', () => {
  test('resolves a 503 gmail_auth as data (does not throw)', async () => {
    mockFetch(503, { error: 'gmail_auth' })

    const res = await runScan()

    expect(res).toEqual({ ok: false, error: 'gmail_auth' })
  })

  test('returns the scan counts on success', async () => {
    const counts = {
      ok: true,
      totalMoved: 5,
      blocklistMoved: 2,
      vipMoved: 1,
      okMoved: 1,
      rulesMoved: 1,
      timeLabel: '10:30 AM',
    }
    mockFetch(200, counts)

    const res = await runScan()

    expect(res).toEqual(counts)
  })
})

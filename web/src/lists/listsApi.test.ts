import { describe, test, expect, vi, beforeEach } from 'vitest'
import {
  addSender,
  removeSender,
  resetBlocklist,
  toggleRule,
  runReapply,
  reapplyUndo,
  mergeLists,
  filterRows,
  chipCounts,
} from './listsApi.ts'

// ---------------------------------------------------------------------------
// Fetch mock helpers
// ---------------------------------------------------------------------------

function jsonRes(status: number, body: unknown, contentType = 'application/json'): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? contentType : null) },
    json: () => Promise.resolve(body),
  } as unknown as Response
}

function sseRes(frames: string[]): Response {
  const encoder = new TextEncoder()
  let i = 0
  const reader = {
    read: () =>
      i < frames.length
        ? Promise.resolve({ done: false, value: encoder.encode(frames[i++]) })
        : Promise.resolve({ done: true, value: undefined }),
  }
  return {
    ok: true,
    status: 200,
    headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? 'text/event-stream' : null) },
    body: { getReader: () => reader },
  } as unknown as Response
}

beforeEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// List / rule mutations
// ---------------------------------------------------------------------------

describe('list mutations', () => {
  test('addSender POSTs to /api/lists/add with the payload', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(jsonRes(200, { ok: true }))
    await addSender({ list: 'vip', email: 'X@Y.com', name: 'Bob' })
    expect(fetch).toHaveBeenCalledWith('/api/lists/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ list: 'vip', email: 'X@Y.com', name: 'Bob' }),
    })
  })

  test('removeSender sends a name-scoped body', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(jsonRes(200, { ok: true }))
    await removeSender({ list: 'ok', email: 'a@b.com', name: 'Ann' })
    const opts = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1]
    expect(JSON.parse(opts.body as string)).toEqual({ list: 'ok', email: 'a@b.com', name: 'Ann' })
    expect(opts.method).toBe('POST')
  })

  test('resetBlocklist POSTs to /api/lists/reset-blocklist', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(jsonRes(200, { ok: true, backedUp: 4 }))
    const r = await resetBlocklist()
    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(url).toBe('/api/lists/reset-blocklist')
    expect(r).toEqual({ ok: true, backedUp: 4 })
  })

  test('toggleRule POSTs the rule id', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(jsonRes(200, { ok: true, enabled: false }))
    const r = await toggleRule({ id: 'r1' })
    const opts = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1]
    expect(JSON.parse(opts.body as string)).toEqual({ id: 'r1' })
    expect(r).toEqual({ ok: true, enabled: false })
  })

  test('maps 503 gmail_auth to the auth-error branch (does not throw)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(jsonRes(503, { error: 'gmail_auth' }))
    const r = await addSender({ list: 'vip', email: 'a@b.com' })
    expect(r).toEqual({ ok: false, error: 'gmail_auth' })
  })

  test('throws on an unexpected non-2xx (500)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(jsonRes(500, { error: 'boom' }))
    await expect(addSender({ list: 'vip', email: 'a@b.com' })).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Reapply (guard + SSE + undo)
// ---------------------------------------------------------------------------

describe('runReapply', () => {
  test('resolves a flat guard JSON as data (does not throw)', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonRes(200, { ok: false, guard: true, count: 250, message: 'confirm?' }))
    const result = await runReapply('blocklist')
    expect(result).toEqual({ kind: 'guard', count: 250, message: 'confirm?' })
  })

  test('resolves an under-threshold done JSON', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonRes(200, { ok: true, list: 'vip', totalLabeled: 0, results: [] }))
    const result = await runReapply('vip')
    expect(result).toEqual({ kind: 'done', totalLabeled: 0, undoable: null })
  })

  test('reads the SSE stream: progress callback + done frame with undoable', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      sseRes([
        'data: {"type":"progress","current":1,"total":2,"email":"a@b.com"}\n\n',
        'data: {"type":"done","ok":true,"list":"vip","totalLabeled":5,"undoable":{"list":"vip","count":5}}\n\n',
      ]),
    )
    const onProgress = vi.fn()
    const result = await runReapply('vip', { confirmed: true, onProgress })
    expect(onProgress).toHaveBeenCalledWith({ current: 1, total: 2, email: 'a@b.com', error: false })
    expect(result).toEqual({ kind: 'done', totalLabeled: 5, undoable: { list: 'vip', count: 5 } })
  })

  test('reapplyUndo returns the parsed result', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonRes(200, { ok: true, list: 'vip', reversed: 3, caveat: null }))
    const r = await reapplyUndo('vip')
    expect(r).toEqual({ ok: true, list: 'vip', reversed: 3, caveat: null })
  })
})

// ---------------------------------------------------------------------------
// Pure view helpers
// ---------------------------------------------------------------------------

describe('mergeLists / filterRows / chipCounts', () => {
  test('merges by lowercased email with per-list memberships, sorted', () => {
    const rows = mergeLists({
      vip: [{ email: 'A@X.com', name: 'Al', date: '2026-01-01' }],
      oklist: [{ email: 'b@x.com', name: 'Bee', date: '2026-01-02' }],
      blocklist: [{ email: 'a@x.com', name: 'Alan', reason: 'spam', date: '2026-01-03' }],
    })
    expect(rows.map((r) => r.email)).toEqual(['a@x.com', 'b@x.com'])
    expect(rows[0].memberships.map((m) => m.list).sort()).toEqual(['blocklist', 'vip'])
    expect(rows[0].memberships.find((m) => m.list === 'blocklist')?.reason).toBe('spam')
  })

  test('chipCounts + filterRows', () => {
    const rows = mergeLists({
      vip: [{ email: 'a@x.com', name: '', date: '' }],
      oklist: [],
      blocklist: [{ email: 'b@x.com', name: '', reason: '', date: '' }],
    })
    expect(chipCounts(rows)).toEqual({ all: 2, blocklist: 1, vip: 1, ok: 0 })
    expect(filterRows(rows, 'vip', '').map((r) => r.email)).toEqual(['a@x.com'])
    expect(filterRows(rows, 'all', 'b@').map((r) => r.email)).toEqual(['b@x.com'])
  })
})

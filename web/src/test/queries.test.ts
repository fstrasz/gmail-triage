import { describe, test, expect, vi, beforeEach } from 'vitest'
import type { UndoDescriptor } from '../lib/api.ts'
import { postAction, postUndo, getQueue, getBodyUrl } from '../lib/api.ts'

// ---------------------------------------------------------------------------
// Fetch mock helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// postAction
// ---------------------------------------------------------------------------

describe('postAction', () => {
  test('POSTs to /api/triage/action and returns parsed ActionResult on success', async () => {
    const undoDesc: UndoDescriptor = {
      action: 'ok',
      id: 'msg-1',
      fromEmail: 'sender@example.com',
      fromName: 'Sender Name',
      addedToList: true,
      listName: 'ok',
    }
    mockFetch(200, { ok: true, labeled: 3, undo: undoDesc })

    const result = await postAction({
      id: 'msg-1',
      action: 'ok',
      fromEmail: 'sender@example.com',
      fromName: 'Sender Name',
    })

    expect(fetch).toHaveBeenCalledWith('/api/triage/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'msg-1',
        action: 'ok',
        fromEmail: 'sender@example.com',
        fromName: 'Sender Name',
      }),
    })
    expect(result).toEqual({ ok: true, labeled: 3, undo: undoDesc })
  })

  test('returns guard response (not throws) when server returns ok:false guard', async () => {
    mockFetch(200, { ok: false, guard: { count: 250, message: 'Too many emails' } })

    const result = await postAction({ id: 'msg-2', action: 'vip', fromEmail: 'a@b.com', fromName: 'A' })

    // Must be a resolved value, NOT a thrown error
    expect(result).toEqual({ ok: false, guard: { count: 250, message: 'Too many emails' } })
  })

  test('maps 503 {error:gmail_auth} to auth-error branch (not throws)', async () => {
    mockFetch(503, { error: 'gmail_auth' })

    const result = await postAction({ id: 'msg-3', action: 'archive', fromEmail: null, fromName: null })

    expect(result).toEqual({ ok: false, error: 'gmail_auth' })
  })

  test('throws on unexpected non-2xx (e.g. 500)', async () => {
    mockFetch(500, { message: 'Internal Server Error' })

    await expect(
      postAction({ id: 'msg-4', action: 'delete', fromEmail: null, fromName: null })
    ).rejects.toThrow()
  })

  test('includes confirmed:true in body when passed', async () => {
    const undoDesc: UndoDescriptor = {
      action: 'junk',
      id: 'msg-5',
      fromEmail: 'x@x.com',
      fromName: 'X',
      addedToList: true,
      listName: 'blocklist',
    }
    mockFetch(200, { ok: true, undo: undoDesc })

    await postAction({
      id: 'msg-5',
      action: 'junk',
      fromEmail: 'x@x.com',
      fromName: 'X',
      confirmed: true,
    })

    const callBody = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string)
    expect(callBody.confirmed).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// postUndo
// ---------------------------------------------------------------------------

describe('postUndo', () => {
  test('POSTs descriptor to /api/triage/undo and returns {ok:true}', async () => {
    mockFetch(200, { ok: true })

    const descriptor: UndoDescriptor = {
      action: 'ok',
      id: 'msg-10',
      fromEmail: 'undo@example.com',
      fromName: 'Undo Test',
      addedToList: false,
    }

    const result = await postUndo(descriptor)

    expect(fetch).toHaveBeenCalledWith('/api/triage/undo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(descriptor),
    })
    expect(result).toEqual({ ok: true })
  })
})

// ---------------------------------------------------------------------------
// getQueue
// ---------------------------------------------------------------------------

describe('getQueue', () => {
  test('GETs /api/triage/queue with correct query params', async () => {
    mockFetch(200, { emails: [], counts: { left: 0 } })

    await getQueue({ hideListed: true, limit: 25 })

    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toBe('/api/triage/queue?hideListed=1&limit=25')
  })

  test('GETs /api/triage/queue with hideListed=0 when false', async () => {
    mockFetch(200, { emails: [], counts: { left: 0 } })

    await getQueue({ hideListed: false, limit: 10 })

    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toBe('/api/triage/queue?hideListed=0&limit=10')
  })
})

// ---------------------------------------------------------------------------
// getBodyUrl
// ---------------------------------------------------------------------------

describe('getBodyUrl', () => {
  test('returns the correct URL string for use as iframe src', () => {
    const url = getBodyUrl('abc-123')
    expect(url).toBe('/api/triage/body?id=abc-123')
  })

  test('encodes special characters in message id', () => {
    const url = getBodyUrl('abc 123+def')
    expect(url).toBe('/api/triage/body?id=abc%20123%2Bdef')
  })
})

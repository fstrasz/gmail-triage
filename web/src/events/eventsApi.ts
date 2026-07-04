// ---------------------------------------------------------------------------
// Events feature API — typed fetch functions over the additive /api/events/*
// JSON endpoints. Mirrors web/src/lib/api.ts conventions: relative /api URLs,
// resolve ok:false auth as data, throw only on unexpected non-2xx.
// ---------------------------------------------------------------------------

/** A found event as stored/served by the backend (found-events object shape). */
export interface EventItem {
  id: string
  title: string
  date: string | null
  time: string | null
  location: string | null
  url: string | null
  canonicalUrl: string | null
  description: string | null
  interest: string | null
  rating: string | number | null
  pricePerPerson: string | null
  source: string | null
  calendarEventUrl: string | null
}

export interface EventGroup {
  location: string
  events: EventItem[]
}

export interface EventsData {
  ok: true
  groups: EventGroup[]
  lastRunAt: string | null
  interests: string[]
  hasInterests: boolean
}

/** Fields sent when adding an event to the calendar (spec order). */
export interface CalendarEventInput {
  title: string
  date: string
  time: string
  location: string
  description: string
  url: string
}

/** Shared auth-error branch (mirrors lib/api.ts). */
export type AuthError = { ok: false; error: 'gmail_auth' }

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function postJson(path: string, body?: unknown): Promise<Response> {
  return fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
}

/** Parse a plain response: throw on any non-2xx. */
async function parseOk<T>(res: Response, label: string): Promise<T> {
  if (!res.ok) throw new Error(`${label} failed: ${res.status}`)
  return res.json() as Promise<T>
}

/** Parse an auth-aware response: 503 {error:gmail_auth} resolves as data. */
async function parseAuthAware<T>(res: Response, label: string): Promise<T | AuthError> {
  if (res.status === 503) {
    const body = (await res.json()) as { error?: string }
    if (body.error === 'gmail_auth') return { ok: false, error: 'gmail_auth' }
  }
  if (!res.ok) throw new Error(`${label} failed: ${res.status}`)
  return res.json() as Promise<T>
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/** GET /api/events — grouped, server-ordered upcoming events. */
export async function getEvents(): Promise<EventsData> {
  const res = await fetch('/api/events')
  return parseOk<EventsData>(res, 'getEvents')
}

/** POST /api/events/ignore — hide an event from the list. */
export async function ignoreEvent(id: string): Promise<{ ok: true }> {
  const res = await postJson('/api/events/ignore', { id })
  return parseOk<{ ok: true }>(res, 'ignoreEvent')
}

/** POST /api/events/calendar — create a calendar entry for an event. */
export async function addToCalendar(
  id: string,
  event: CalendarEventInput,
): Promise<{ ok: true; url: string } | AuthError> {
  const res = await postJson('/api/events/calendar', { id, event })
  return parseAuthAware<{ ok: true; url: string }>(res, 'addToCalendar')
}

/** POST /api/events/search — run the events search now (slow). */
export async function searchNow(): Promise<{ ok: true; added: number } | AuthError> {
  const res = await postJson('/api/events/search')
  return parseAuthAware<{ ok: true; added: number }>(res, 'searchNow')
}

/** POST /api/events/send-email — prune + send the events digest email. */
export async function sendEventsEmail(): Promise<{ ok: true } | AuthError> {
  const res = await postJson('/api/events/send-email')
  return parseAuthAware<{ ok: true }>(res, 'sendEventsEmail')
}

/** POST /api/events/reset-rebuild — wipe + rebuild the events set (slow). */
export async function resetRebuild(): Promise<{ ok: true; added: number } | AuthError> {
  const res = await postJson('/api/events/reset-rebuild')
  return parseAuthAware<{ ok: true; added: number }>(res, 'resetRebuild')
}

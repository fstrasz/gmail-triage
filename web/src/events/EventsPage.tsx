import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { CalendarEventInput } from './eventsApi.ts'
import {
  useAddToCalendar,
  useEvents,
  useIgnoreEvent,
  useResetRebuild,
  useSearchNow,
  useSendEmail,
} from './eventsQueries.ts'
import { EventCard } from './EventCard.tsx'

export function EventsPage() {
  const events = useEvents()
  const ignore = useIgnoreEvent()
  const addCal = useAddToCalendar()
  const search = useSearchNow()
  const sendEmail = useSendEmail()
  const resetRebuild = useResetRebuild()

  const [authError, setAuthError] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [calError, setCalError] = useState<string | null>(null)

  // A successful (re)fetch proves Gmail is reachable again — clear the banner.
  const dataUpdatedAt = events.dataUpdatedAt
  useEffect(() => {
    if (events.isSuccess) setAuthError(false)
  }, [dataUpdatedAt, events.isSuccess])

  const data = events.data
  const lastRunLabel = data?.lastRunAt
    ? `Last searched: ${new Date(data.lastRunAt).toLocaleString()}`
    : 'Never searched'

  async function handleAddToCalendar(id: string, input: CalendarEventInput): Promise<boolean> {
    setCalError(null)
    try {
      const result = await addCal.mutateAsync({ id, event: input })
      if (!result.ok) {
        setAuthError(true)
        return false
      }
      return true
    } catch (e) {
      // A non-auth calendar failure (e.g. Google 400 on a bad/blank date) rejects
      // mutateAsync; surface it instead of leaving an unhandled rejection + stuck dialog.
      setCalError(e instanceof Error ? e.message : 'Failed to add to calendar.')
      return false
    }
  }

  function runSearch() {
    search.mutate(undefined, {
      onSuccess: (result) => {
        if (!result.ok) setAuthError(true)
      },
    })
  }

  function runSendEmail() {
    sendEmail.mutate(undefined, {
      onSuccess: (result) => {
        if (!result.ok) setAuthError(true)
      },
    })
  }

  function runResetRebuild() {
    setConfirmReset(false)
    resetRebuild.mutate(undefined, {
      onSuccess: (result) => {
        if (!result.ok) setAuthError(true)
      },
    })
  }

  // A genuine fetch failure has no data to show — full-screen reconnect.
  if (events.isError) {
    return <ReconnectGmail />
  }

  return (
    <div className="flex h-full flex-col p-4">
      {authError && <ReconnectGmail banner />}
      {calError && (
        <div className="mb-3 rounded-xl border border-junk/40 bg-junk/5 px-4 py-3 text-sm text-ink">
          Couldn't add to calendar: {calError}
        </div>
      )}

      <header className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="shrink-0 text-lg font-semibold text-ink">Events</h1>
        <span className="text-xs text-muted">{lastRunLabel}</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={runSearch}
            disabled={search.isPending}
            aria-busy={search.isPending}
            className="rounded-lg bg-ink px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {search.isPending ? 'Searching…' : 'Search Now'}
          </button>
          <button
            type="button"
            onClick={runSendEmail}
            disabled={sendEmail.isPending}
            aria-busy={sendEmail.isPending}
            className="rounded-lg border border-hairline px-3 py-1.5 text-sm font-medium text-ink disabled:opacity-40"
          >
            {sendEmail.isPending ? 'Sending…' : 'Send Email'}
          </button>
          {confirmReset ? (
            <span className="flex items-center gap-2 rounded-lg border border-junk bg-junk/5 px-2 py-1 text-xs text-junk">
              Delete all found events &amp; re-scan?
              <button
                type="button"
                onClick={runResetRebuild}
                disabled={resetRebuild.isPending}
                className="rounded bg-junk px-2 py-1 font-semibold text-white disabled:opacity-40"
              >
                {resetRebuild.isPending ? 'Rebuilding…' : 'Confirm'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="rounded border border-hairline px-2 py-1 font-medium text-ink"
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              disabled={resetRebuild.isPending}
              aria-busy={resetRebuild.isPending}
              className="rounded-lg border border-junk px-3 py-1.5 text-sm font-medium text-junk disabled:opacity-40"
            >
              {resetRebuild.isPending ? 'Rebuilding…' : 'Reset & Rebuild'}
            </button>
          )}
        </div>
      </header>

      {data && !data.hasInterests && (
        <div className="mb-4 rounded-xl border border-hairline border-l-4 border-l-vip bg-vip/5 px-4 py-3 text-sm text-ink">
          No event interests configured.{' '}
          <Link to="/settings" className="font-semibold text-ink underline underline-offset-2">
            Add some in Settings
          </Link>{' '}
          to start finding events.
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {events.isPending ? (
          <EventsSkeleton />
        ) : !data || data.groups.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
            {data.groups.map((group) => (
              <section key={group.location}>
                <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
                  📍 {group.location}
                </h2>
                <ul className="flex flex-col gap-3">
                  {group.events.map((event) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      onIgnore={(id) => ignore.mutate(id)}
                      onAddToCalendar={handleAddToCalendar}
                      calendarPending={addCal.isPending}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ---- Sub-states ------------------------------------------------------------

function EventsSkeleton() {
  return (
    <div data-testid="events-skeleton" className="mx-auto flex w-full max-w-3xl animate-pulse flex-col gap-3">
      <div className="h-24 rounded-xl border border-hairline bg-hairline/40" />
      <div className="h-24 rounded-xl border border-hairline bg-hairline/40" />
      <div className="h-24 rounded-xl border border-hairline bg-hairline/40" />
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-16 text-center text-muted">
      <p className="text-lg font-semibold text-ink">No upcoming events found</p>
      <p className="mt-1 text-sm">Use "Search Now" to find events, or enable scheduled search in Settings.</p>
    </div>
  )
}

function ReconnectGmail({ banner = false }: { banner?: boolean }) {
  if (banner) {
    return (
      <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-junk/40 bg-junk/5 px-4 py-3 text-sm">
        <span className="font-semibold text-ink">Reconnect Gmail</span>
        <a href="/auth" className="rounded-lg bg-ink px-3 py-1.5 font-semibold text-white">
          Reconnect
        </a>
      </div>
    )
  }
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
      <p className="text-lg font-semibold text-ink">Reconnect Gmail</p>
      <p className="text-sm text-muted">The Gmail connection expired. Re-authorize to continue.</p>
      <a href="/auth" className="rounded-xl bg-ink px-4 py-2 font-semibold text-white">
        Reconnect
      </a>
    </div>
  )
}

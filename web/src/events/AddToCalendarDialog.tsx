import * as Dialog from '@radix-ui/react-dialog'
import { useState } from 'react'
import type { CalendarEventInput, EventItem } from './eventsApi.ts'

const FIELD =
  'w-full rounded-lg border border-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink'

export function AddToCalendarDialog({
  event,
  open,
  onOpenChange,
  onSubmit,
  pending,
}: {
  event: EventItem
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: CalendarEventInput) => void
  pending: boolean
}) {
  // Prefilled from the event; initialized once per mount (one dialog per card).
  const [form, setForm] = useState<CalendarEventInput>(() => ({
    title: event.title ?? '',
    date: event.date ?? '',
    time: event.time ?? '',
    location: event.location ?? '',
    description: event.description ?? '',
    url: event.url ?? '',
  }))

  function update<K extends keyof CalendarEventInput>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(30rem,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-5 shadow-xl">
          <Dialog.Title className="text-base font-semibold text-ink">Add to Calendar</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted">
            Confirm the details before creating the calendar event.
          </Dialog.Description>
          <form
            className="mt-4 flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              onSubmit(form)
            }}
          >
            <label className="flex flex-col gap-1 text-xs font-medium text-muted">
              Title
              <input
                className={FIELD}
                value={form.title}
                onChange={(e) => update('title', e.target.value)}
              />
            </label>
            <div className="flex gap-3">
              <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-muted">
                Date
                <input
                  type="date"
                  className={FIELD}
                  value={form.date}
                  onChange={(e) => update('date', e.target.value)}
                />
              </label>
              <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-muted">
                Time
                <input
                  type="time"
                  className={FIELD}
                  value={form.time}
                  onChange={(e) => update('time', e.target.value)}
                />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted">
              Location
              <input
                className={FIELD}
                value={form.location}
                onChange={(e) => update('location', e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted">
              URL
              <input
                type="url"
                className={FIELD}
                value={form.url}
                onChange={(e) => update('url', e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted">
              Description
              <textarea
                rows={2}
                className={`${FIELD} resize-y`}
                value={form.description}
                onChange={(e) => update('description', e.target.value)}
              />
            </label>
            <div className="mt-1 flex justify-end gap-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded-lg border border-hairline px-4 py-2 text-sm font-medium text-ink"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={pending}
                className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                {pending ? 'Adding…' : 'Add to Calendar'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

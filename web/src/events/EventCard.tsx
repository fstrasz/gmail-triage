import { useState } from "react";
import { AddToCalendarDialog } from "./AddToCalendarDialog.tsx";
import type { CalendarEventInput, EventItem } from "./eventsApi.ts";

export function EventCard({
  event,
  onIgnore,
  onAddToCalendar,
  calendarPending,
}: {
  event: EventItem;
  onIgnore: (id: string) => void;
  /** Resolves true when the calendar entry was created (so the dialog closes). */
  onAddToCalendar: (id: string, input: CalendarEventInput) => Promise<boolean>;
  calendarPending: boolean;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const displayUrl = event.canonicalUrl || event.url;

  async function submit(input: CalendarEventInput) {
    const ok = await onAddToCalendar(event.id, input);
    if (ok) setDialogOpen(false);
  }

  return (
    <li className="rounded-xl border border-hairline bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">
            {displayUrl ? (
              <a
                href={displayUrl}
                target="_blank"
                rel="noopener"
                className="text-ink underline decoration-hairline underline-offset-2 hover:decoration-ink"
              >
                {event.title} ↗
              </a>
            ) : (
              event.title
            )}
            {event.interest && (
              <span className="ml-1 text-xs font-normal text-muted">
                — {event.interest}
              </span>
            )}
          </p>

          {(event.pricePerPerson || event.rating != null) && (
            <p className="mt-1 flex items-center gap-2 text-xs">
              {event.pricePerPerson && (
                <span className="font-semibold text-ok">
                  {event.pricePerPerson} / person
                </span>
              )}
              {event.rating != null && (
                <span className="text-muted">⭐ {event.rating}</span>
              )}
            </p>
          )}

          <p className="mt-1 text-xs text-ink/80">
            📅 {event.date || "TBD"}
            {event.time ? ` at ${event.time}` : ""} &nbsp;|&nbsp; 📍{" "}
            {event.location || "TBD"}
          </p>

          {event.description && (
            <p className="mt-1 text-xs text-muted">{event.description}</p>
          )}

          {event.calendarEventUrl && (
            <p className="mt-2">
              <a
                href={event.calendarEventUrl}
                target="_blank"
                rel="noopener"
                className="text-xs font-medium text-ok underline underline-offset-2"
              >
                ✓ Added to Calendar
              </a>
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-2">
          {!event.calendarEventUrl && (
            <button
              type="button"
              onClick={() => setDialogOpen(true)}
              className="rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-white"
            >
              Add to Calendar
            </button>
          )}
          <button
            type="button"
            onClick={() => onIgnore(event.id)}
            className="rounded-lg border border-hairline px-3 py-1.5 text-xs font-medium text-muted"
          >
            Ignore
          </button>
        </div>
      </div>

      {!event.calendarEventUrl && (
        <AddToCalendarDialog
          event={event}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onSubmit={submit}
          pending={calendarPending}
        />
      )}
    </li>
  );
}

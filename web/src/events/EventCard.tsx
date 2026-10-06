import { CalendarDays, Check, ExternalLink, MapPin, Star } from "lucide-react";
import { useState } from "react";
import { eventDate } from "../lib/format.ts";
import { btnSecondary } from "../shell/ui.ts";
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
    <li className="rounded-xl border border-rule bg-paper p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-[0.9375rem] font-semibold text-ink">
            {displayUrl ? (
              <a
                href={displayUrl}
                target="_blank"
                rel="noopener"
                className="text-ink underline decoration-hairline underline-offset-2 hover:decoration-ink"
              >
                {event.title}
                <ExternalLink
                  aria-hidden
                  size={13}
                  className="ml-1 inline-block align-[-1px] text-muted"
                />
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
                <span className="inline-flex items-center gap-1 text-muted">
                  <Star aria-hidden size={12} />
                  <span className="sr-only">Rating</span> {event.rating}
                </span>
              )}
            </p>
          )}

          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-graphite">
            <span className="inline-flex items-center gap-1">
              <CalendarDays aria-hidden size={13} />
              {eventDate(event.date) || "Date TBD"}
              {event.time ? ` at ${event.time}` : ""}
            </span>
            <span className="inline-flex items-center gap-1">
              <MapPin aria-hidden size={13} />
              {event.location || "Location TBD"}
            </span>
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
                <Check
                  aria-hidden
                  size={13}
                  className="mr-1 inline-block align-[-2px]"
                />
                Added to Calendar
              </a>
            </p>
          )}
        </div>

        <div className="flex shrink-0 gap-2 sm:flex-col">
          {!event.calendarEventUrl && (
            <button
              type="button"
              onClick={() => setDialogOpen(true)}
              className={btnSecondary}
            >
              Add to Calendar
            </button>
          )}
          <button
            type="button"
            onClick={() => onIgnore(event.id)}
            className={btnSecondary}
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

import type { FormEvent } from "react";
import { useState } from "react";
import type { ReviewEvent } from "./reviewApi.ts";

// Editable per-event form. Seeds from the Claude-extracted event; the operator
// can adjust before creating the calendar entry. Submits the edited event to
// the parent (which POSTs /api/review/calendar with the matching eventIndex).
export function CalendarForm({
  event,
  disabled,
  onCreate,
}: {
  event: ReviewEvent;
  disabled: boolean;
  onCreate: (event: ReviewEvent) => void;
}) {
  const [title, setTitle] = useState(event.title);
  const [date, setDate] = useState(event.date ?? "");
  const [time, setTime] = useState(event.time ?? "");
  const [location, setLocation] = useState(event.location ?? "");
  const [description, setDescription] = useState(event.description ?? "");

  function submit(e: FormEvent) {
    e.preventDefault();
    onCreate({
      title,
      date: date || null,
      time: time || null,
      location,
      description,
      url: event.url,
    });
  }

  const field = "rounded border border-hairline px-2 py-1 text-sm text-ink";

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-2 rounded-lg border border-hairline p-3"
    >
      <input
        aria-label="Event title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className={field}
      />
      <div className="flex gap-2">
        <input
          aria-label="Event date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className={field}
        />
        <input
          aria-label="Event time"
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className={field}
        />
      </div>
      <input
        aria-label="Event location"
        value={location}
        onChange={(e) => setLocation(e.target.value)}
        placeholder="Location"
        className={field}
      />
      <textarea
        aria-label="Event description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        className={field}
      />
      <button
        type="submit"
        disabled={disabled}
        className="self-start rounded-lg bg-review px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
      >
        Add to Calendar
      </button>
    </form>
  );
}

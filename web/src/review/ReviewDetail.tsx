import { CalendarForm } from "./CalendarForm.tsx";
import type { ReviewAction, ReviewEvent, ReviewItem } from "./reviewApi.ts";
import { formatDate, getBodyUrl } from "./reviewApi.ts";

const ACTION_BTN: { action: ReviewAction; label: string; cls: string }[] = [
  { action: "keep", label: "Keep", cls: "bg-ok" },
  { action: "archive", label: "Archive", cls: "bg-muted" },
  { action: "junk", label: "Junk", cls: "bg-junk" },
];

export function ReviewDetail({
  item,
  busy,
  onExecute,
  onCalendar,
  onCreateAll,
  onDismiss,
}: {
  item: ReviewItem;
  busy: boolean;
  onExecute: (id: string, action: ReviewAction) => void;
  onCalendar: (id: string, eventIndex: number, event: ReviewEvent) => void;
  onCreateAll: (entries: { event: ReviewEvent; idx: number }[]) => void;
  onDismiss: (id: string) => void;
}) {
  const { analysis } = item;
  // analysis is JSON.parse of raw model output — `events` may be absent if the
  // model deviated from the instructed schema; never dereference it unguarded.
  const events = Array.isArray(analysis.events) ? analysis.events : [];
  const pending = item.status === "pending";
  const links = item.calendarLinks ?? {};
  // Events without a created calendar link yet — drives the "Create All" button.
  const uncreated = events
    .map((event, idx) => ({ event, idx }))
    .filter(({ idx }) => !links[String(idx)]);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex-shrink-0 border-b border-hairline px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-sm text-muted">
            {item.from} · {formatDate(item.date)}
          </p>
          {!pending && item.executedAction && (
            <span className="shrink-0 rounded bg-ok px-1.5 py-0.5 text-xs font-semibold text-white">
              ✓ {item.executedAction}
            </span>
          )}
        </div>
        <h2 className="mt-1 font-semibold text-ink">{item.subject}</h2>
      </div>

      <div className="flex flex-col gap-4 px-4 py-4">
        <div className="rounded-lg bg-hairline/30 p-3 text-sm text-ink">
          {analysis.summary}
        </div>

        {analysis.actionReason && (
          <p className="text-sm italic text-muted">
            Suggested:{" "}
            <span className="font-semibold not-italic text-ink">
              {analysis.action}
            </span>
            {" — "}
            {analysis.actionReason}
          </p>
        )}

        {pending && (
          <div className="flex flex-wrap gap-2">
            {ACTION_BTN.map((b) => (
              <button
                key={b.action}
                type="button"
                disabled={busy}
                onClick={() => onExecute(item.id, b.action)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 ${b.cls}`}
              >
                {b.label}
              </button>
            ))}
            <button
              type="button"
              disabled={busy}
              onClick={() => onDismiss(item.id)}
              className="rounded-lg border border-hairline px-4 py-2 text-sm font-medium text-ink disabled:opacity-40"
            >
              Dismiss
            </button>
          </div>
        )}

        {events.length > 0 && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Events ({events.length})
              </p>
              {uncreated.length > 1 && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onCreateAll(uncreated)}
                  className="rounded-lg bg-review px-3 py-1 text-xs font-semibold text-white disabled:opacity-40"
                >
                  Create All {uncreated.length}
                </button>
              )}
            </div>
            {events.map((event, idx) => {
              const existing = links[String(idx)];
              return (
                <div key={idx} className="flex flex-col gap-1">
                  <p className="text-sm font-semibold text-ink">
                    {event.title}
                  </p>
                  {existing ? (
                    <a
                      href={existing}
                      target="_blank"
                      rel="noreferrer"
                      className="self-start rounded-lg border border-hairline px-3 py-1.5 text-sm font-semibold text-review"
                    >
                      Open in Calendar
                    </a>
                  ) : (
                    <CalendarForm
                      event={event}
                      disabled={busy}
                      onCreate={(edited) => onCalendar(item.id, idx, edited)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {analysis.draftReply && (
          <div className="flex flex-col gap-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Draft reply
            </p>
            <textarea
              aria-label="Draft reply"
              readOnly
              value={analysis.draftReply}
              rows={6}
              className="rounded-lg border border-hairline bg-hairline/30 p-3 text-sm text-ink"
            />
          </div>
        )}

        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Email
          </p>
          <iframe
            title="Email body"
            sandbox="allow-popups"
            src={getBodyUrl(item.id)}
            className="h-96 w-full rounded-lg border border-hairline"
          />
        </div>
      </div>
    </div>
  );
}

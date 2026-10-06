import { CalendarDays, Check } from "lucide-react";
import { Stamp, type StampTone } from "../shell/Stamp.tsx";
import type { ReviewItem } from "./reviewApi.ts";
import { formatDate } from "./reviewApi.ts";

// Colored action badge per suggested disposition (tokens, no raw hexes).
const ACTION_BADGE: Record<string, { label: string; tone: StampTone }> = {
  keep: { label: "Keep", tone: "ok" },
  archive: { label: "Archive", tone: "graphite" },
  junk: { label: "Junk", tone: "junk" },
  none: { label: "None", tone: "note" },
};

// "Name <addr@x>" → "Name"; a bare address is returned as-is.
function senderName(from: string): string {
  const name = from
    .replace(/<[^>]*>/, "")
    .replace(/"/g, "")
    .trim();
  return name || from;
}

function Row({
  item,
  selected,
  onSelect,
}: {
  item: ReviewItem;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const badge = ACTION_BADGE[item.analysis.action] ?? ACTION_BADGE.none;
  const eventCount = Array.isArray(item.analysis.events)
    ? item.analysis.events.length
    : 0;
  const executed = item.status === "executed";
  return (
    <li>
      <button
        type="button"
        aria-current={selected ? "true" : undefined}
        onClick={() => onSelect(item.id)}
        className={`w-full px-3 py-2 text-left transition-colors ${
          selected
            ? "bg-paper ring-1 ring-inset ring-rule-strong"
            : "hover:bg-paper/60"
        }`}
      >
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
            {senderName(item.from)}
          </span>
          {executed && (
            <Check
              aria-label="Executed"
              size={16}
              className="shrink-0 text-ok"
            />
          )}
        </div>
        <p className="truncate text-sm text-muted">{item.subject}</p>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-xs text-muted">{formatDate(item.date)}</span>
          <Stamp tone={badge.tone}>{badge.label}</Stamp>
          {eventCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-rule-strong px-1.5 py-0.5 text-xs text-muted">
              <CalendarDays aria-hidden size={12} />
              {eventCount}
              <span className="sr-only">
                {eventCount === 1 ? "event" : "events"}
              </span>
            </span>
          )}
        </div>
      </button>
    </li>
  );
}

export function ReviewList({
  pending,
  executed,
  selectedId,
  onSelect,
}: {
  pending: ReviewItem[];
  executed: ReviewItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-col">
      {pending.length > 0 && (
        <>
          <p className="px-3 py-2 text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-muted">
            Pending
          </p>
          <ul className="flex flex-col divide-y divide-hairline">
            {pending.map((item) => (
              <Row
                key={item.id}
                item={item}
                selected={item.id === selectedId}
                onSelect={onSelect}
              />
            ))}
          </ul>
        </>
      )}
      {executed.length > 0 && (
        <>
          <p className="mt-2 px-3 py-2 text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-muted">
            Executed
          </p>
          <ul className="flex flex-col divide-y divide-hairline">
            {executed.map((item) => (
              <Row
                key={item.id}
                item={item}
                selected={item.id === selectedId}
                onSelect={onSelect}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

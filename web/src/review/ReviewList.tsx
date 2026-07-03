import type { ReviewItem } from './reviewApi.ts'
import { formatDate } from './reviewApi.ts'

// Colored action badge per suggested disposition (tokens, no raw hexes).
const ACTION_BADGE: Record<string, { label: string; cls: string }> = {
  keep: { label: 'Keep', cls: 'bg-ok text-white' },
  archive: { label: 'Archive', cls: 'bg-muted text-white' },
  junk: { label: 'Junk', cls: 'bg-junk text-white' },
  none: { label: 'None', cls: 'border border-hairline text-muted' },
}

function Row({
  item,
  selected,
  onSelect,
}: {
  item: ReviewItem
  selected: boolean
  onSelect: (id: string) => void
}) {
  const badge = ACTION_BADGE[item.analysis.action] ?? ACTION_BADGE.none
  const eventCount = Array.isArray(item.analysis.events) ? item.analysis.events.length : 0
  const executed = item.status === 'executed'
  return (
    <li>
      <button
        type="button"
        aria-current={selected ? 'true' : undefined}
        onClick={() => onSelect(item.id)}
        className={`w-full px-3 py-2 text-left transition-colors ${
          selected ? 'bg-ink/5 shadow-[inset_3px_0_0] shadow-ink' : 'hover:bg-hairline/30'
        }`}
      >
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{item.from}</span>
          {executed && <span aria-label="Executed" className="shrink-0 font-semibold text-ok">✓</span>}
        </div>
        <p className="truncate text-sm text-muted">{item.subject}</p>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-xs text-muted">{formatDate(item.date)}</span>
          <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${badge.cls}`}>{badge.label}</span>
          {eventCount > 0 && (
            <span className="rounded-full border border-hairline px-1.5 py-0.5 text-xs text-muted">
              📅 {eventCount}
            </span>
          )}
        </div>
      </button>
    </li>
  )
}

export function ReviewList({
  pending,
  executed,
  selectedId,
  onSelect,
}: {
  pending: ReviewItem[]
  executed: ReviewItem[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <div className="flex flex-col">
      {pending.length > 0 && (
        <>
          <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted">Pending</p>
          <ul className="flex flex-col divide-y divide-hairline">
            {pending.map((item) => (
              <Row key={item.id} item={item} selected={item.id === selectedId} onSelect={onSelect} />
            ))}
          </ul>
        </>
      )}
      {executed.length > 0 && (
        <>
          <p className="mt-2 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted">Executed</p>
          <ul className="flex flex-col divide-y divide-hairline">
            {executed.map((item) => (
              <Row key={item.id} item={item} selected={item.id === selectedId} onSelect={onSelect} />
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

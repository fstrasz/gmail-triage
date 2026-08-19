import { Card } from '../Card.tsx'
import type { StatsDay } from '../settingsApi.ts'

/** Sum of every counted action for one day — the bar's height driver. */
function dayTotal(d: StatsDay): number {
  return d.kept + d.cleaned + d.junked + d.unsubbed + d.vip + d.ok
}

/**
 * Walk the last 30 calendar days (oldest first, today last) and look each up
 * in `daily`, filling absent days with zeros. Mirrors app/lib/pages.js's
 * statsPage() last30 derivation exactly, including the UTC date key — the
 * old page and this chart must agree on which day a data point lands in.
 */
function last30Days(daily: StatsDay[]): StatsDay[] {
  const days: StatsDay[] = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    const found = daily.find((e) => e.date === key)
    days.push(
      found || { date: key, kept: 0, cleaned: 0, junked: 0, unsubbed: 0, vip: 0, ok: 0, inboxSize: null },
    )
  }
  return days
}

export function StatsChart({ daily }: { daily?: StatsDay[] }) {
  if (!daily || daily.length === 0) {
    return (
      <Card title="Last 30 Days">
        <p className="text-sm text-muted">No activity yet.</p>
      </Card>
    )
  }

  const days = last30Days(daily)
  const max = Math.max(1, ...days.map(dayTotal))

  return (
    <Card title="Last 30 Days">
      <div className="flex h-24 items-end gap-0.5">
        {days.map((d) => {
          const total = dayTotal(d)
          const pct = total === 0 ? 2 : Math.round((total / max) * 100)
          return (
            <div
              key={d.date}
              data-testid="stats-bar"
              data-date={d.date}
              data-total={total}
              title={`${d.date}: ${total}`}
              className="flex-1 rounded-t bg-ink/70"
              style={{ height: `${pct}%` }}
            />
          )
        })}
      </div>
    </Card>
  )
}

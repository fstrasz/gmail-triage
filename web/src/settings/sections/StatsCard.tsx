import { Card } from "../Card.tsx";
import type { Stats } from "../settingsApi.ts";

type StatsTotalKey = "vip" | "ok" | "cleaned" | "junked" | "unsubbed";

const ITEMS: { key: StatsTotalKey; label: string }[] = [
  { key: "vip", label: "VIP" },
  { key: "ok", label: "OK" },
  { key: "cleaned", label: "Cleaned" },
  { key: "junked", label: "Junked" },
  { key: "unsubbed", label: "Unsubbed" },
];

export function StatsCard({ stats }: { stats: Stats }) {
  return (
    <Card title="Totals">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {ITEMS.map((it) => (
          <div
            key={it.key}
            className="rounded-lg bg-hairline/30 p-2 text-center"
          >
            <dt className="text-xs uppercase tracking-wide text-muted">
              {it.label}
            </dt>
            <dd className="text-lg font-semibold text-ink">
              {stats[it.key] ?? 0}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

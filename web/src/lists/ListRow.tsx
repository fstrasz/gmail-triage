import type { ListName, MergedRow } from "./listsApi.ts";

const BADGE: Record<ListName, { label: string; cls: string }> = {
  vip: { label: "VIP", cls: "bg-vip" },
  ok: { label: "OK", cls: "bg-ok" },
  blocklist: { label: "Block", cls: "bg-junk" },
};

export function ListRow({
  row,
  onRemove,
  removing,
}: {
  row: MergedRow;
  onRemove: (list: ListName, email: string, name?: string) => void;
  removing: boolean;
}) {
  const name = row.memberships.find((m) => m.name)?.name ?? "";
  const reason = row.memberships.find((m) => m.reason)?.reason;

  return (
    <li className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-1">
        {row.memberships.map((m, i) => (
          <span
            key={`${m.list}-${i}`}
            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-bold text-white ${BADGE[m.list].cls}`}
          >
            {BADGE[m.list].label}
            <button
              type="button"
              aria-label={`Remove ${m.name || row.email} from ${BADGE[m.list].label}`}
              disabled={removing}
              onClick={() => onRemove(m.list, row.email, m.name || undefined)}
              className="leading-none hover:opacity-80 disabled:opacity-40"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-ink">{name || row.email}</p>
        {name && <p className="truncate text-xs text-muted">{row.email}</p>}
        {reason && (
          <p className="truncate text-xs text-muted">Reason: {reason}</p>
        )}
      </div>
    </li>
  );
}

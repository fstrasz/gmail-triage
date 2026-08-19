import { useState } from "react";
import { AddSenderForm } from "./AddSenderForm.tsx";
import { DangerZone } from "./DangerZone.tsx";
import { ListRow } from "./ListRow.tsx";
import type { Filter, ListName } from "./listsApi.ts";
import { chipCounts, filterRows, mergeLists } from "./listsApi.ts";
import { useLists, useRemoveSender } from "./listsQueries.ts";
import { ReapplyBar } from "./ReapplyBar.tsx";
import { RulesSection } from "./RulesSection.tsx";

const FILTERS: Filter[] = ["all", "blocklist", "vip", "ok"];
const FILTER_LABEL: Record<Filter, string> = {
  all: "All",
  blocklist: "Blocked",
  vip: "VIP",
  ok: "OK",
};

export function ListsPage() {
  const lists = useLists();
  const removeSender = useRemoveSender();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");

  // Render branches in Slice-1 order: isError → isPending → data (empty is
  // shown inline in the table so the Add form + rules stay reachable).
  if (lists.isError) return <ReconnectGmail />;
  if (lists.isPending) return <ListsSkeleton />;

  const data = lists.data;
  const rows = mergeLists(data);
  const counts = chipCounts(rows);
  const visible = filterRows(rows, filter, search);

  function onRemove(list: ListName, email: string, name?: string) {
    removeSender.mutate({ list, email, name });
  }

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-4">
      <h1 className="text-lg font-semibold text-ink">Lists</h1>

      <AddSenderForm />

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={`rounded-full border px-3 py-1 text-sm font-medium ${
                filter === f
                  ? "border-ink bg-ink text-white"
                  : "border-hairline text-muted"
              }`}
            >
              {FILTER_LABEL[f]} <span className="font-mono">{counts[f]}</span>
            </button>
          ))}
          <input
            type="search"
            aria-label="Search senders"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ml-auto rounded-lg border border-hairline px-3 py-1 text-sm text-ink"
          />
        </div>

        {visible.length === 0 ? (
          <p
            data-testid="lists-empty"
            className="rounded-xl border border-hairline p-6 text-center text-sm text-muted"
          >
            {rows.length === 0
              ? "No senders on any list yet."
              : "No senders match this filter."}
          </p>
        ) : (
          <ul className="divide-y divide-hairline rounded-xl border border-hairline">
            {visible.map((row) => (
              <ListRow
                key={row.email}
                row={row}
                onRemove={onRemove}
                removing={removeSender.isPending}
              />
            ))}
          </ul>
        )}
      </section>

      <ReapplyBar />
      <DangerZone backups={data.backups} />
      <RulesSection rules={data.rules} />
    </div>
  );
}

// ---- Sub-states ------------------------------------------------------------

function ListsSkeleton() {
  return (
    <div data-testid="lists-skeleton" className="flex flex-col gap-4 p-4">
      <div className="h-8 w-32 animate-pulse rounded bg-hairline/60" />
      <div className="h-24 animate-pulse rounded-xl bg-hairline/40" />
      <div className="h-48 animate-pulse rounded-xl bg-hairline/40" />
    </div>
  );
}

function ReconnectGmail() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
      <p className="text-lg font-semibold text-ink">Reconnect Gmail</p>
      <p className="text-sm text-muted">
        The Gmail connection expired. Re-authorize to load your lists.
      </p>
      <a
        href="/auth"
        className="rounded-xl bg-ink px-4 py-2 font-semibold text-white"
      >
        Reconnect
      </a>
    </div>
  );
}

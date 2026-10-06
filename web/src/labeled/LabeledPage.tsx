import { useState } from "react";
import { shortDate } from "../lib/format.ts";
import { pill } from "../shell/ui.ts";
import type { LabeledTier } from "./labeledApi.ts";
import { useLabeled } from "./labeledQueries.ts";

const TIERS: { value: LabeledTier; label: string }[] = [
  { value: "..VIP", label: "VIP" },
  { value: "..OK", label: "OK" },
  { value: ".DelPend", label: "Blocklist" },
];

export function LabeledPage() {
  const [tier, setTier] = useState<LabeledTier>("..VIP");
  const labeled = useLabeled(tier);

  return (
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col gap-4 overflow-y-auto p-3 sm:p-4 lg:p-5">
      <h1 className="text-xl font-semibold text-ink">Labeled</h1>

      <div className="flex flex-wrap items-center gap-2">
        {TIERS.map((t) => (
          <button
            key={t.value}
            type="button"
            aria-pressed={tier === t.value}
            onClick={() => setTier(t.value)}
            className={pill(tier === t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {labeled.isError ? (
        <p
          data-testid="labeled-error"
          className="rounded-xl border border-dashed border-rule-strong p-6 text-center text-sm text-muted"
        >
          Could not load labeled mail. Try again later.
        </p>
      ) : labeled.isPending ? (
        <div data-testid="labeled-loading" className="flex flex-col gap-4">
          <div className="h-16 rounded-xl border border-rule bg-paper motion-safe:animate-pulse" />
          <div className="h-16 rounded-xl border border-rule bg-paper motion-safe:animate-pulse" />
          <div className="h-16 rounded-xl border border-rule bg-paper motion-safe:animate-pulse" />
        </div>
      ) : labeled.data.items.length === 0 ? (
        <p
          data-testid="labeled-empty"
          className="rounded-xl border border-dashed border-rule-strong p-6 text-center text-sm text-muted"
        >
          No mail labeled {TIERS.find((t) => t.value === tier)?.label} yet.
        </p>
      ) : (
        <ul className="divide-y divide-rule overflow-hidden rounded-xl border border-rule bg-paper">
          {labeled.data.items.map((item) => (
            <li key={item.id} className="flex flex-col gap-1 p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-semibold text-ink">
                  {item.subject || "(no subject)"}
                </span>
                <span className="tabular shrink-0 text-xs text-muted">
                  {shortDate(item.date)}
                </span>
              </div>
              <span className="truncate text-xs text-muted">{item.from}</span>
              <span className="truncate text-xs text-muted">
                {item.snippet}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

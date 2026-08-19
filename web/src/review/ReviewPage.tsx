import { useState } from "react";
import { useMediaQuery } from "../lib/useMediaQuery.ts";
import { ReviewDetail } from "./ReviewDetail.tsx";
import { ReviewList } from "./ReviewList.tsx";
import type { ReviewEvent } from "./reviewApi.ts";
import {
  useCalendar,
  useDismiss,
  useExecute,
  useReview,
} from "./reviewQueries.ts";

export function ReviewPage() {
  const review = useReview();
  const execute = useExecute();
  const calendar = useCalendar();
  const dismiss = useDismiss();

  const desktop = useMediaQuery("(hover: hover) and (pointer: fine)");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const items = review.data ?? [];
  const pending = items.filter((i) => i.status === "pending");
  const executed = items.filter((i) => i.status !== "pending");
  const ordered = [...pending, ...executed]; // pending first

  // Desktop always shows a detail (default to the first item); mobile shows the
  // list until a row is tapped (active stays null → list view).
  const active =
    ordered.find((i) => i.id === selectedId) ??
    (desktop ? (ordered[0] ?? null) : null);
  const busy = execute.isPending || calendar.isPending || dismiss.isPending;
  const actionError = execute.isError || calendar.isError || dismiss.isError;

  // Create calendar events one at a time — /api/review/calendar does a
  // load→merge→save on calendarLinks, so parallel writes clobber each other
  // (last writer wins), losing links and creating duplicate calendar entries.
  async function createAll(
    id: string,
    entries: { event: ReviewEvent; idx: number }[],
  ) {
    for (const { event, idx } of entries) {
      try {
        await calendar.mutateAsync({ id, eventIndex: idx, event });
      } catch {
        break; // stop on first failure; surfaced via the action-error banner
      }
    }
  }

  // ---- States (isError → isPending → empty → data) -------------------------
  if (review.isError) return <ReconnectGmail />;
  if (review.isPending) return <ReviewSkeleton />;
  if (items.length === 0) return <EmptyReview />;

  const list = (
    <ReviewList
      pending={pending}
      executed={executed}
      selectedId={active?.id ?? null}
      onSelect={(id) => setSelectedId(id)}
    />
  );

  const detail = active ? (
    <ReviewDetail
      item={active}
      busy={busy}
      onExecute={(id, action) => execute.mutate({ id, action })}
      onCalendar={(id, eventIndex, event) =>
        calendar.mutate({ id, eventIndex, event })
      }
      onCreateAll={(entries) => {
        void createAll(active.id, entries);
      }}
      onDismiss={(id) => dismiss.mutate(id)}
    />
  ) : null;

  if (desktop) {
    return (
      <div className="flex h-full flex-col p-4">
        <Header count={pending.length} />
        {actionError && <ActionErrorBanner />}
        <div className="flex flex-1 overflow-hidden rounded-2xl border border-hairline">
          <aside className="w-72 flex-shrink-0 overflow-y-auto border-r border-hairline">
            {list}
          </aside>
          <div className="min-w-0 flex-1 overflow-hidden bg-white">
            {detail ?? (
              <p className="p-4 text-sm text-muted">Select a review item.</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Mobile: list, tapping a row opens the detail (with Back).
  return (
    <div className="flex h-full flex-col p-4">
      <Header count={pending.length} />
      {actionError && <ActionErrorBanner />}
      {active ? (
        <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-hairline bg-white">
          <button
            type="button"
            onClick={() => setSelectedId(null)}
            className="flex-shrink-0 border-b border-hairline px-4 py-2 text-left text-sm font-semibold text-ink"
          >
            ← Back
          </button>
          <div className="min-h-0 flex-1">{detail}</div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto rounded-2xl border border-hairline">
          {list}
        </div>
      )}
    </div>
  );
}

// ---- Sub-states ------------------------------------------------------------

function Header({ count }: { count: number }) {
  return (
    <header className="mb-4 flex items-center gap-3">
      <h1 className="text-lg font-semibold text-ink">
        Review <span className="font-mono text-muted">{count}</span>
      </h1>
    </header>
  );
}

function ActionErrorBanner() {
  return (
    <div
      role="alert"
      className="mb-3 rounded-xl border border-junk/40 bg-junk/5 px-4 py-2 text-sm text-ink"
    >
      That action didn't complete — please try again.
    </div>
  );
}

function ReviewSkeleton() {
  return (
    <div className="flex h-full flex-col p-4">
      <Header count={0} />
      <div
        data-testid="review-skeleton"
        className="flex-1 animate-pulse rounded-2xl border border-hairline bg-hairline/40"
      />
    </div>
  );
}

function EmptyReview() {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center text-muted">
      <p className="text-lg font-semibold text-ink">Nothing to review</p>
      <p className="mt-1 text-sm">
        Queue an email for Claude review from the triage screen.
      </p>
    </div>
  );
}

function ReconnectGmail() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
      <p className="text-lg font-semibold text-ink">Reconnect Gmail</p>
      <p className="text-sm text-muted">
        The review queue could not be loaded. Re-authorize to continue.
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

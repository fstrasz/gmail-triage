import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import type { TriageAction, TriageEmail } from "../lib/api.ts";
import { shortDate } from "../lib/format.ts";
import { Stamp } from "../shell/Stamp.tsx";
import { ACTION_COLOR, ACTION_LABEL } from "./actionMeta.ts";
import { Reader } from "./Reader.tsx";
import type { Dir, Mode } from "./swipeMap.ts";
import { swipeAction } from "./swipeMap.ts";

const DIRS: Dir[] = ["up", "left", "right", "down"];
/** Cross layout: each direction sits on its own arm of a 3x3 grid. */
const DIR_CELL: Record<Dir, string> = {
  up: "col-start-2 row-start-1 justify-center",
  left: "col-start-1 row-start-2 justify-start",
  right: "col-start-3 row-start-2 justify-end",
  down: "col-start-2 row-start-3 justify-center",
};
const DIR_ICON: Record<Dir, LucideIcon> = {
  right: ArrowRight,
  left: ArrowLeft,
  up: ArrowUp,
  down: ArrowDown,
};

export function senderHref(email: TriageEmail): string {
  // FIX D — match the live /sender route contract (?email=&name=) and the old
  // UI (app/lib/html.js). The previous ?q= param always bounced home because the
  // route reads req.query.email and redirects to / when it's absent.
  const e = encodeURIComponent(email.fromEmail ?? "");
  const n = encodeURIComponent(email.fromName ?? "");
  return `/sender?email=${e}&name=${n}`;
}

/** VIP / OK stamp for a tiered message; nothing for unlisted mail. */
export function TierStamp({ tier }: { tier: TriageEmail["tier"] }) {
  if (tier === "..VIP") return <Stamp tone="vip">VIP</Stamp>;
  if (tier === "..OK") return <Stamp tone="ok">OK</Stamp>;
  return null;
}

export function Card({
  email,
  mode,
  onAction,
}: {
  email: TriageEmail;
  mode: Mode;
  /** When set (top card only), legend entries are tappable and Show message
   *  opens the full-screen reader with every action. */
  onAction?: (a: TriageAction) => void;
}) {
  const [reading, setReading] = useState(false);

  return (
    <div className="flex h-full min-h-72 flex-col rounded-2xl border border-rule bg-paper p-4 text-ink sm:p-5">
      {/* Header: sender + tier stamp + date */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold">
            {email.fromName ?? email.fromEmail ?? "Unknown sender"}
          </p>
          {email.fromEmail && (
            <p className="truncate text-sm font-medium text-graphite">
              {email.fromEmail}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <TierStamp tier={email.tier} />
          {email.date && (
            <span className="tabular text-xs text-muted">
              {shortDate(email.date)}
            </span>
          )}
        </div>
      </div>

      {/* Subject + snippet */}
      <p className="mt-4 text-[0.9375rem] font-semibold leading-snug">
        {email.subject || "(no subject)"}
      </p>
      <p className="mt-1.5 line-clamp-4 text-sm leading-relaxed text-graphite">
        {email.snippet}
      </p>

      <div className="mt-auto flex items-center justify-between gap-3 pt-3 text-sm">
        <button
          type="button"
          aria-label="Show email body"
          className="inline-flex min-h-11 items-center font-semibold text-ink underline decoration-rule-strong underline-offset-[3px]"
          onClick={() => setReading(true)}
        >
          Show message
        </button>
        <a
          href={senderHref(email)}
          aria-label={`View all from this sender (${email.fromEmail ?? email.fromName ?? ""})`}
          className="inline-flex min-h-11 items-center text-muted underline decoration-rule-strong underline-offset-[3px]"
        >
          All from sender
        </a>
      </div>

      {/* DECK-1: persistent on-card legend of the current mode's four swipe directions. */}
      <ul
        aria-label="Swipe legend"
        className="grid grid-cols-3 grid-rows-3 gap-x-2 border-t border-dashed border-rule-strong pt-3 text-xs"
      >
        {DIRS.map((d) => {
          const action = swipeAction(mode, d);
          const Icon = DIR_ICON[d];
          const icon = (
            <Icon
              aria-hidden
              size={14}
              strokeWidth={2}
              className="shrink-0 text-ink"
            />
          );
          const label = (
            <span className={`font-semibold ${ACTION_COLOR[action]}`}>
              {ACTION_LABEL[action]}
            </span>
          );
          // Arrow sits on the outer side of each arm, pointing away from centre.
          const content =
            d === "right" ? (
              <>
                {label}
                {icon}
              </>
            ) : (
              <>
                {icon}
                {label}
              </>
            );
          const cell = `flex min-h-9 w-full items-center gap-1.5 whitespace-nowrap ${DIR_CELL[d]}`;
          return (
            <li key={d} className={`flex text-muted ${DIR_CELL[d]}`}>
              {onAction ? (
                <button
                  type="button"
                  aria-label={ACTION_LABEL[action]}
                  className={`${cell} rounded-md active:bg-sunk`}
                  onClick={() => onAction(action)}
                >
                  {content}
                </button>
              ) : (
                <span className={cell}>{content}</span>
              )}
            </li>
          );
        })}
      </ul>

      {onAction && (
        <Reader
          email={email}
          mode={mode}
          open={reading}
          onOpenChange={setReading}
          onAction={onAction}
        />
      )}
    </div>
  );
}

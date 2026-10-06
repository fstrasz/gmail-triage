import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import type { TriageEmail } from "../lib/api.ts";
import { getBodyUrl } from "../lib/api.ts";
import { shortDate } from "../lib/format.ts";
import { Stamp } from "../shell/Stamp.tsx";
import { ACTION_COLOR, ACTION_LABEL } from "./actionMeta.ts";
import type { Dir, Mode } from "./swipeMap.ts";
import { swipeAction } from "./swipeMap.ts";

const DIRS: Dir[] = ["right", "left", "up", "down"];
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

export function Card({ email, mode }: { email: TriageEmail; mode: Mode }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="flex h-full min-h-72 flex-col rounded-2xl border border-rule bg-paper p-4 text-ink sm:p-5">
      {/* Header: sender + tier stamp + date */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold">
            {email.fromName ?? email.fromEmail ?? "Unknown sender"}
          </p>
          {email.fromEmail && (
            <p className="truncate text-xs text-muted">{email.fromEmail}</p>
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
      {!expanded && (
        <p className="mt-1.5 line-clamp-4 text-sm leading-relaxed text-graphite">
          {email.snippet}
        </p>
      )}

      {/* Body — sandboxed iframe ONLY (FIX H4, XSS). Never dangerouslySetInnerHTML. */}
      {expanded && (
        <iframe
          title="Email body"
          sandbox="allow-popups"
          src={getBodyUrl(email.id)}
          className="mt-3 h-64 w-full flex-1 rounded-lg border border-rule bg-white"
        />
      )}

      <div className="mt-auto flex items-center justify-between gap-3 pt-3 text-sm">
        <button
          type="button"
          aria-label={expanded ? "Hide email body" : "Show email body"}
          className="inline-flex min-h-11 items-center font-semibold text-ink underline decoration-rule-strong underline-offset-[3px]"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Hide message" : "Show message"}
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
        className="grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-dashed border-rule-strong pt-3 text-xs"
      >
        {DIRS.map((d) => {
          const action = swipeAction(mode, d);
          const Icon = DIR_ICON[d];
          return (
            <li key={d} className="flex items-center gap-1.5 text-muted">
              <Icon
                aria-hidden
                size={14}
                strokeWidth={2}
                className="text-ink"
              />
              <span className={`font-semibold ${ACTION_COLOR[action]}`}>
                {ACTION_LABEL[action]}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

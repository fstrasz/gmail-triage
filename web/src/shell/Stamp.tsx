import type { ReactNode } from "react";

// The notebook's mark: a decision inked onto the page like a rubber stamp.
// Every tier/list badge and every action result uses this one form, so a
// colour always reads as the same decision (VIP, OK, Junk, Review).
export type StampTone = "vip" | "ok" | "junk" | "review" | "graphite" | "note";

const TONE: Record<StampTone, string> = {
  vip: "text-vip",
  ok: "text-ok",
  junk: "text-junk",
  review: "text-review",
  graphite: "text-graphite",
  // A pencilled note rather than an ink decision: dashed, uncoloured.
  note: "text-graphite border-dashed",
};

export function Stamp({
  tone,
  children,
  className = "",
  animate = false,
  ...rest
}: {
  tone: StampTone;
  children: ReactNode;
  className?: string;
  /** Press-in on mount — used for the result of an action just taken. */
  animate?: boolean;
} & Omit<React.HTMLAttributes<HTMLSpanElement>, "className" | "children">) {
  return (
    <span
      {...rest}
      className={`inline-flex max-w-full items-center gap-1 rounded-[4px] border-[1.5px] border-current bg-current/[0.07] px-1.5 py-px align-middle text-[0.6875rem] font-bold uppercase leading-4 tracking-[0.06em] ${TONE[tone]} ${
        animate ? "motion-safe:animate-stamp" : ""
      } ${className}`}
    >
      {children}
    </span>
  );
}

import type { TriageAction } from "../lib/api.ts";

export type Mode = "hidden" | "shown";
export type Dir = "left" | "right" | "up" | "down";

// All eleven actions in canonical order. delete-all/archive-all sit right
// after delete, matching their desktop placement "under Delete".
export const ALL9: readonly TriageAction[] = [
  "ok",
  "vip",
  "ok-clean",
  "vip-clean",
  "junk",
  "unsub",
  "archive",
  "delete",
  "delete-all",
  "archive-all",
  "review",
];

// Touch swipe gestures per mode. Hidden mode (unlisted senders) swipes to the
// sender-wide outcomes — Unsub and Delete All — rather than Junk and Delete
// (operator direction, 2026-10-20).
const SWIPE_MAP: Record<Mode, Record<Dir, TriageAction>> = {
  hidden: { right: "ok-clean", left: "unsub", up: "vip", down: "delete-all" },
  shown: { right: "archive", left: "junk", up: "ok", down: "review" },
};

export function swipeAction(mode: Mode, dir: Dir): TriageAction {
  return SWIPE_MAP[mode][dir];
}

// Arrow keys (desktop) keep the original per-message mapping: Delete All and
// Unsub deliberately have no key, so a stray keypress can't trigger them.
const ARROW_MAP: Record<Mode, Record<Dir, TriageAction>> = {
  hidden: { right: "ok-clean", left: "junk", up: "vip", down: "delete" },
  shown: SWIPE_MAP.shown,
};

export function arrowAction(mode: Mode, dir: Dir): TriageAction {
  return ARROW_MAP[mode][dir];
}

// Tap buttons per mode for every action not covered by a swipe (the swipe
// actions are also tappable via the on-card legend, so none is gesture-only).
// `sender` actions act on all of the sender's mail and render as their own
// labelled row. Hidden mode is one row: Junk, Delete, Archive and Review are
// not offered there on touch (operator direction, 2026-10-20), which leaves
// three buttons that fit beside each other.
export const TAP_GROUPS: Record<
  Mode,
  { message: TriageAction[]; sender: TriageAction[] }
> = {
  hidden: {
    message: ["ok", "vip-clean", "archive-all"],
    sender: [],
  },
  shown: {
    message: ["vip", "unsub", "delete"],
    sender: ["ok-clean", "vip-clean", "archive-all", "delete-all"],
  },
};

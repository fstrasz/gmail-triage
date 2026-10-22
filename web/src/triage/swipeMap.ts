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

// Touch swipe gestures. Both modes swipe left to Unsub rather than Junk
// (operator direction, 2026-10-20); down is Delete, which asks whether to
// delete this message or all from the sender (operator direction, 2026-10-22).
// The shown mode uses the same touch layout as hidden (2026-10-22).
const TOUCH_SWIPES: Record<Dir, TriageAction> = {
  right: "ok-clean",
  left: "unsub",
  up: "vip",
  down: "delete",
};
const SWIPE_MAP: Record<Mode, Record<Dir, TriageAction>> = {
  hidden: TOUCH_SWIPES,
  shown: TOUCH_SWIPES,
};

export function swipeAction(mode: Mode, dir: Dir): TriageAction {
  return SWIPE_MAP[mode][dir];
}

// Arrow keys (desktop) keep the original per-message mapping: Delete All and
// Unsub deliberately have no key, so a stray keypress can't trigger them.
const ARROW_MAP: Record<Mode, Record<Dir, TriageAction>> = {
  hidden: { right: "ok-clean", left: "junk", up: "vip", down: "delete" },
  shown: { right: "archive", left: "junk", up: "ok", down: "review" },
};

export function arrowAction(mode: Mode, dir: Dir): TriageAction {
  return ARROW_MAP[mode][dir];
}

// Tap buttons per mode for every action not covered by a swipe (the swipe
// actions are also tappable via the on-card legend, so none is gesture-only).
// `sender` actions act on all of the sender's mail and render as their own
// labelled row. Touch is one row in both modes: Junk, Archive and Review are
// not offered there, and Delete All is reached through Delete's prompt (operator direction, 2026-10-20 / 2026-10-22),
// which leaves three buttons that fit beside each other.
const TOUCH_TAPS = {
  message: ["ok", "vip-clean", "archive-all"] as TriageAction[],
  sender: [] as TriageAction[],
};
export const TAP_GROUPS: Record<
  Mode,
  { message: TriageAction[]; sender: TriageAction[] }
> = {
  hidden: TOUCH_TAPS,
  shown: TOUCH_TAPS,
};

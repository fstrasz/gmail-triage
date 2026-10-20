import type { TriageAction } from "../lib/api.ts";

export type Mode = "hidden" | "shown";
export type Dir = "left" | "right" | "up" | "down";

// All eleven actions in canonical order (canonical order).
// delete-all/archive-all (sender-wide, no swipe assigned — too destructive for
// an accidental gesture) sit right after delete, matching their desktop
// placement "under Delete".
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

// Swipe gestures per mode
const SWIPE_MAP: Record<Mode, Record<Dir, TriageAction>> = {
  hidden: { right: "ok-clean", left: "junk", up: "vip", down: "delete" },
  shown: { right: "archive", left: "junk", up: "ok", down: "review" },
};

export function swipeAction(mode: Mode, dir: Dir): TriageAction {
  return SWIPE_MAP[mode][dir];
}

// Tap buttons per mode: every action NOT covered by a swipe, so nothing is
// hidden behind an overflow menu (DECK-3). The swipe actions are also tappable
// via the on-card legend, so no action is gesture-only. `sender` actions act on
// all of the sender's mail and render as their own labelled group.
export const TAP_GROUPS: Record<
  Mode,
  { message: TriageAction[]; sender: TriageAction[] }
> = {
  hidden: {
    message: ["ok", "archive", "review", "unsub"],
    sender: ["vip-clean", "archive-all", "delete-all"],
  },
  shown: {
    message: ["vip", "unsub", "delete"],
    sender: ["ok-clean", "vip-clean", "archive-all", "delete-all"],
  },
};

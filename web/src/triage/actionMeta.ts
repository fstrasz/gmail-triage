import type { TriageAction } from "../lib/api.ts";
import type { StampTone } from "../shell/Stamp.tsx";
import type { Dir } from "./swipeMap.ts";

// Human label + semantic color token per action. The label is the accessible
// name for every button/menu-item (DECK-3) so a control with each action's
// name is findable by screen reader / test.
export const ACTION_LABEL: Record<TriageAction, string> = {
  ok: "OK",
  vip: "VIP",
  "ok-clean": "OK & Clean",
  "vip-clean": "VIP & Clean",
  junk: "Junk",
  unsub: "Unsub",
  archive: "Archive",
  delete: "Delete",
  "delete-all": "Delete All",
  "archive-all": "Archive All",
  review: "Review",
};

// Ink per action — the one colour that action's mark is stamped in. Neutral
// moves (archive, unsub, sender-wide archive) are graphite: they file mail
// away without a judgement, so they borrow no decision colour.
export const ACTION_TONE: Record<TriageAction, StampTone> = {
  ok: "ok",
  vip: "vip",
  "ok-clean": "ok",
  "vip-clean": "vip",
  junk: "junk",
  unsub: "graphite",
  archive: "graphite",
  delete: "junk",
  "delete-all": "junk",
  "archive-all": "graphite",
  review: "review",
};

// Tailwind text-color utility per action (references semantic tokens).
export const ACTION_COLOR: Record<TriageAction, string> = {
  ok: "text-ok",
  vip: "text-vip",
  "ok-clean": "text-ok",
  "vip-clean": "text-vip",
  junk: "text-junk",
  unsub: "text-graphite",
  archive: "text-graphite",
  delete: "text-junk",
  "delete-all": "text-junk",
  "archive-all": "text-graphite",
  review: "text-review",
};

export const DIR_ARROW: Record<Dir, string> = {
  right: "→",
  left: "←",
  up: "↑",
  down: "↓",
};

// Single source of truth for undoability, mirroring the backend
// ACTION_DISPATCH[...].undo === 'none' (app/lib/triageApi.js). unsub/review/
// delete-all/archive-all have no compensating server call, so the UI must NOT
// promise undo for them (FIX H3). Everything else (ok/vip/archive/delete
// reversible; ok-clean/vip-clean/junk reverse list membership only) IS undoable.
const NON_UNDOABLE: ReadonlySet<TriageAction> = new Set<TriageAction>([
  "unsub",
  "review",
  "delete-all",
  "archive-all",
]);

export function isUndoable(action: TriageAction): boolean {
  return !NON_UNDOABLE.has(action);
}

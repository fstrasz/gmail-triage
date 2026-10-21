import type { TriageAction } from "../lib/api.ts";
import type { ToastInfo } from "./Toast.tsx";

const ACTION_VERB: Record<TriageAction, string> = {
  ok: "Marked OK",
  vip: "Marked VIP",
  "ok-clean": "OK & Clean",
  "vip-clean": "VIP & Clean",
  junk: "Junked",
  unsub: "Unsubscribed",
  archive: "Archived",
  delete: "Deleted",
  "delete-all": "Deleted all",
  "archive-all": "Archived all",
  review: "Queued for review",
};

// What Undo will (or will not) do for each action.
const UNDO_TAIL: Record<TriageAction, string> = {
  ok: ". Undo removes from list.",
  vip: ". Undo removes from list.",
  "ok-clean": ". Undo removes from list.",
  "vip-clean": ". Undo removes from list.",
  junk: ". Undo removes from blocklist.",
  unsub: "; sender blocklisted (not reversible here)",
  archive: ". Undo available.",
  delete: ". Undo available.",
  "delete-all": ", not reversible here",
  "archive-all": ", not reversible here",
  review: "",
};

// The action is queued, not done: the server works through it in the
// background, so the copy reports the enqueue and what Undo means.
export function toastMessage(info: ToastInfo): string {
  const { action } = info.undo;
  return `${ACTION_VERB[action]} — queued${UNDO_TAIL[action]}`;
}

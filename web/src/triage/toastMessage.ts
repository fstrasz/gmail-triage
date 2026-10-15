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

function messages(n: number): string {
  return `${n} ${n === 1 ? "message" : "messages"}`;
}

// Every action reports how many of the sender's messages it touched (`labeled`
// from the server) and what it did to them.
export function toastMessage(info: ToastInfo): string {
  const { action } = info.undo;
  const verb = ACTION_VERB[action];
  const n = info.labeled ?? 0;
  switch (action) {
    case "ok":
    case "vip":
      return `${verb} — ${messages(n)} labeled ${action === "vip" ? "..VIP" : "..OK"}. Undo removes from list.`;
    case "ok-clean":
    case "vip-clean":
      return `${verb} — ${messages(n)} archived to .DelPend and marked read. Undo removes from list.`;
    case "junk":
      return `${verb} — ${messages(n)} moved to .DelPend and marked read. Undo removes from blocklist.`;
    case "unsub":
      return `${verb} — ${messages(n)} moved to .DelPend and marked read; sender blocklisted (not reversible here)`;
    case "delete-all":
    case "archive-all":
      return `${verb} — ${messages(n)}, not reversible here`;
    case "archive":
      // A thread archive reports no count (see the server route).
      return info.labeled === undefined
        ? `${verb} — thread. Undo available.`
        : `${verb} — ${messages(n)}. Undo available.`;
    case "delete":
      return `${verb} — ${messages(n)} moved to Trash. Undo available.`;
    case "review":
      return `${verb} — ${messages(n)} labeled For_Review`;
  }
}

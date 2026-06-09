import { isViplisted } from "./viplist.js";
import { isOklisted } from "./oklist.js";

// True when a sender is on the VIP or OK keep-list. Single source of truth for the
// triage "Hide VIP/OK senders" filter, which skips already-listed senders from the queue.
export function isListedSender(email, name = null) {
  return isViplisted(email, name) || isOklisted(email, name);
}

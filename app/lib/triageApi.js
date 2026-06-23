import { isListedSender } from "./listedSender.js";
import { isBlocked } from "./blocklist.js";
import { extractEmail, extractName } from "./gmail.js";

export function shapeTriageEmail(e) {
  const fromEmail = e.fromEmail ?? (e.from ? extractEmail(e.from) : null);
  const fromName  = e.fromName  ?? (e.from ? extractName(e.from)  : null);
  return {
    id: e.id, threadId: e.threadId,
    fromEmail, fromName,
    subject: e.subject || "", snippet: e.snippet || "", date: e.date || "",
    tier: e.tier ?? null, ruleLabels: e.ruleLabels || [],
    hasUnsub: !!e.listUnsubscribe,
    unsubUrl:  e.listUnsubscribe     || null,
    unsubPost: e.listUnsubscribePost || null,
  };
}

export function filterHidden(emails, { hideListed }) {
  return emails.filter(e => {
    const em = e.fromEmail ?? (e.from ? extractEmail(e.from) : "");
    const nm = e.fromName  ?? (e.from ? extractName(e.from)  : null);
    if (isBlocked(em, nm)) return false;                // always exclude blocked
    if (hideListed && isListedSender(em, nm)) return false;
    return true;
  });
}

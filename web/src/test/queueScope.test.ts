import { describe, expect, test } from "vitest";
import type { TriageAction, TriageEmail } from "../lib/api.ts";
import { coveredCardIds } from "../triage/queueScope.ts";
import fixture from "./fixtures/queueScope.json";

interface Case {
  name: string;
  job: {
    action: TriageAction;
    msgId: string;
    fromEmail: string;
    fromName: string | null;
  };
  msg: {
    id: string;
    fromEmail: string;
    fromName: string | null;
    tier: "..VIP" | "..OK" | null;
  };
  hideListed: boolean;
  covered: boolean;
}

function card(m: Case["msg"]): TriageEmail {
  return {
    id: m.id,
    threadId: null,
    fromEmail: m.fromEmail,
    fromName: m.fromName,
    subject: "",
    snippet: "",
    date: "",
    tier: m.tier,
    ruleLabels: [],
    hasUnsub: false,
    unsubUrl: null,
    unsubPost: null,
  };
}

describe("coveredCardIds", () => {
  test("matches every shared fixture case", () => {
    for (const c of fixture as Case[]) {
      // The acted card is the job's own message; the case's msg is another
      // card in the deck (or the same one when the ids match).
      const acted = card({
        id: c.job.msgId,
        fromEmail: c.job.fromEmail,
        fromName: c.job.fromName,
        tier: null,
      });
      const other = card(c.msg);
      const cards = other.id === acted.id ? [other] : [acted, other];
      const actedCard = other.id === acted.id ? other : acted;
      const ids = coveredCardIds(c.job.action, actedCard, cards, {
        hideListed: c.hideListed,
      });
      expect(ids.includes(c.msg.id), c.name).toBe(c.covered);
      expect(ids[0], `${c.name}: acted card first`).toBe(c.job.msgId);
    }
  });
});

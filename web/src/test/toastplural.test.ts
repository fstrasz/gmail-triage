import { describe, expect, test } from "vitest";
import type { TriageAction } from "../lib/api.ts";
import { toastMessage } from "../triage/toastMessage.ts";

function info(action: TriageAction) {
  return { undo: { jobId: "job-1", action } };
}

// The toast reports the enqueue (no message count exists yet) plus what Undo
// will do for that action.
describe("toastMessage queued copy", () => {
  test("junk reads '<verb> — queued' plus its undo tail", () => {
    expect(toastMessage(info("junk"))).toBe(
      "Junked — queued. Undo removes from blocklist.",
    );
  });
  test("a sender-wide action says it is not reversible", () => {
    expect(toastMessage(info("delete-all"))).toBe(
      "Deleted all — queued, not reversible here",
    );
  });
  test("review has no undo tail", () => {
    expect(toastMessage(info("review"))).toBe("Queued for review — queued");
  });
});

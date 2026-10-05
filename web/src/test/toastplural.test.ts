import { describe, expect, test } from "vitest";
import type { UndoDescriptor } from "../lib/api.ts";
import { toastMessage } from "../triage/toastMessage.ts";

function info(labeled: number) {
  return {
    undo: { action: "delete-all" } as unknown as UndoDescriptor,
    labeled,
  };
}

describe("toastMessage plural", () => {
  test("count 1 reads 'message'", () => {
    expect(toastMessage(info(1))).toContain("1 message,");
  });
  test("count 2 reads 'messages'", () => {
    expect(toastMessage(info(2))).toContain("2 messages,");
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { ActionResult, TriageEmail, UndoDescriptor } from "../lib/api.ts";

// Same mocking pattern as keyboard.test.tsx.
const hookState: {
  queue: {
    data: { emails: TriageEmail[]; counts: { left: number } } | undefined;
    isPending: boolean;
    isError: boolean;
  };
  actionResult: ActionResult;
} = {
  queue: { data: undefined, isPending: false, isError: false },
  actionResult: { ok: true, undo: stubUndo() },
};

const actionMutate = vi.fn(
  (
    _payload: unknown,
    opts?: {
      onSuccess?: (r: ActionResult) => void;
      onSettled?: () => void;
    },
  ) => {
    opts?.onSuccess?.(hookState.actionResult);
    opts?.onSettled?.();
  },
);

function stubUndo(): UndoDescriptor {
  return {
    action: "archive",
    id: "e1",
    fromEmail: "a@b.com",
    fromName: "A",
    addedToList: false,
    listName: "ok",
  };
}

vi.mock("../lib/queries.ts", () => ({
  useQueue: () => hookState.queue,
  useAction: () => ({ mutate: actionMutate, isPending: false }),
  useUndo: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { TriagePage } from "../triage/TriagePage.tsx";

function makeEmail(id: string): TriageEmail {
  return {
    id,
    threadId: null,
    fromEmail: `${id}@example.com`,
    fromName: `Name ${id}`,
    subject: `Subject ${id}`,
    snippet: `snippet ${id}`,
    date: "2026-06-01",
    tier: null,
    ruleLabels: [],
    hasUnsub: true,
    unsubUrl: "https://example.com/unsub",
    unsubPost: null,
  };
}

const origMatchMedia = window.matchMedia;
function setDesktop(matches: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches,
    media: "",
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }) as unknown as typeof window.matchMedia;
}

function lastPayload() {
  return actionMutate.mock.calls.at(-1)?.[0] as { action: string; id: string };
}

beforeEach(() => {
  vi.clearAllMocks();
  hookState.queue = {
    data: {
      emails: [makeEmail("e1"), makeEmail("e2"), makeEmail("e3")],
      counts: { left: 3 },
    },
    isPending: false,
    isError: false,
  };
  hookState.actionResult = { ok: true, undo: stubUndo() };
  setDesktop(true);
});

afterEach(() => {
  window.matchMedia = origMatchMedia;
});

describe("Desktop keyboard path", () => {
  test("click a non-top row, then ArrowLeft commits the CLICKED card (focus moves off the row button)", () => {
    render(<TriagePage />);
    const row = screen.getByRole("button", { name: /Name e2/ });
    row.focus();
    fireEvent.click(row);
    // Real browsers fire the keydown at the focused element.
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "ArrowLeft",
    });
    expect(actionMutate).toHaveBeenCalledTimes(1);
    expect(lastPayload()).toMatchObject({ id: "e2", action: "junk" });
  });

  test("j / k change selection without acting", () => {
    render(<TriagePage />);
    fireEvent.keyDown(document, { key: "j" });
    expect(
      screen.getByRole("button", { name: /Name e2/ }).getAttribute("aria-current"),
    ).toBe("true");
    fireEvent.keyDown(document, { key: "k" });
    expect(
      screen.getByRole("button", { name: /Name e1/ }).getAttribute("aria-current"),
    ).toBe("true");
    expect(actionMutate).not.toHaveBeenCalled();
  });

  test.each([
    ["e", "archive"],
    ["#", "delete"],
    ["!", "junk"],
    ["v", "vip"],
    ["o", "ok"],
    ["r", "review"],
  ])("%s commits %s on the selected card", (key, expected) => {
    render(<TriagePage />);
    fireEvent.keyDown(document, { key: "j" }); // select e2
    fireEvent.keyDown(document, { key });
    expect(actionMutate).toHaveBeenCalledTimes(1);
    expect(lastPayload()).toMatchObject({ id: "e2", action: expected });
  });

  test("no shortcut fires while an input is focused or with Ctrl held", () => {
    render(<TriagePage />);
    const input = document.createElement("input");
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: "e" });
    document.body.removeChild(input);
    fireEvent.keyDown(document, { key: "e", ctrlKey: true });
    expect(actionMutate).not.toHaveBeenCalled();
  });

  test("? opens the shortcuts dialog and Esc closes it", () => {
    render(<TriagePage />);
    fireEvent.keyDown(document, { key: "?" });
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(
      screen.getByText(/no shortcut — use the buttons/i),
    ).toBeTruthy();
    fireEvent.keyDown(document.activeElement ?? document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("column renders 'All from this sender' before Delete All", () => {
    render(<TriagePage />);
    const label = screen.getByText("All from this sender");
    const deleteAll = screen.getByRole("button", { name: "Delete All" });
    expect(
      label.compareDocumentPosition(deleteAll) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe("Mobile thumb zone", () => {
  test("Undo renders after the Deck card and before the action buttons; Hide toggle after them", () => {
    setDesktop(false);
    render(<TriagePage />);
    fireEvent.keyDown(document, { key: "ArrowRight" }); // commit -> toast
    const undo = screen.getByRole("button", { name: "Undo last action" });
    const action = screen.getByRole("button", { name: "More actions" });
    const toggle = screen.getByRole("button", {
      name: "Hide VIP/OK listed senders",
    });
    const FOLLOWING = Node.DOCUMENT_POSITION_FOLLOWING;
    expect(undo.compareDocumentPosition(action) & FOLLOWING).toBeTruthy();
    expect(action.compareDocumentPosition(toggle) & FOLLOWING).toBeTruthy();
    expect(screen.getByRole("banner").contains(undo)).toBe(false);
  });
});

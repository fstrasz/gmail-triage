import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { ActionResult, TriageEmail } from "../lib/api.ts";

// ---------------------------------------------------------------------------
// Mock ../lib/queries.ts — same pattern as deckui.test.tsx.
// ---------------------------------------------------------------------------

interface QueueState {
  data: { emails: TriageEmail[]; counts: { left: number } } | undefined;
  isPending: boolean;
  isError: boolean;
}

// A mutateAsync double that settles SYNCHRONOUSLY (TriagePage only chains
// `.then`); `inFlight` never settles, like an enqueue awaiting its response.
interface SyncThenable {
  then: (onOk?: (v: unknown) => unknown) => SyncThenable;
}
function settled(value: unknown): SyncThenable {
  return { then: (onOk) => settled(onOk ? onOk(value) : value) };
}
const inFlight: SyncThenable = { then: () => inFlight };

const QUEUED: ActionResult = { ok: true, queued: true, jobId: "job-1" };

const hookState: {
  queue: QueueState;
  actionResult: ActionResult;
} = {
  queue: { data: undefined, isPending: false, isError: false },
  actionResult: QUEUED,
};

const actionMutate = vi.fn((_payload: unknown) =>
  settled(hookState.actionResult),
);

const undoMutate = vi.fn((_payload: unknown) =>
  settled({ ok: true, state: "cancelled" }),
);
const queueRefetch = vi.fn();

vi.mock("../lib/queries.ts", () => ({
  useQueue: () => ({ ...hookState.queue, refetch: queueRefetch }),
  useAction: () => ({ mutateAsync: actionMutate }),
  useUndo: () => ({ mutateAsync: undoMutate }),
  useQueueStatus: () => ({ data: undefined, dataUpdatedAt: 0, refetch: vi.fn() }),
  useActionInFlight: () => false,
  currentStartedFetchSeq: () => 0,
}));

// Import AFTER the mock is registered.
import { TriagePage } from "../triage/TriagePage.tsx";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEmail(id: string, over: Partial<TriageEmail> = {}): TriageEmail {
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
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  hookState.queue = {
    data: { emails: [makeEmail("e1"), makeEmail("e2")], counts: { left: 2 } },
    isPending: false,
    isError: false,
  };
  hookState.actionResult = QUEUED;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Keyboard shortcuts", () => {
  test("1. ArrowRight in hidden mode commits ok-clean (arrowAction hidden+right)", () => {
    render(<TriagePage />);

    // Default mode is 'hidden'. arrowAction('hidden','right') === 'ok-clean'
    fireEvent.keyDown(document, { key: "ArrowRight" });

    expect(actionMutate).toHaveBeenCalledTimes(1);
    const payload = actionMutate.mock.calls[0][0] as {
      action: string;
      id: string;
    };
    expect(payload.action).toBe("ok-clean");
    expect(payload.id).toBe("e1");
  });

  test("2. ArrowLeft in hidden mode commits junk (arrowAction hidden+left)", () => {
    render(<TriagePage />);

    fireEvent.keyDown(document, { key: "ArrowLeft" });

    expect(actionMutate).toHaveBeenCalledTimes(1);
    const payload = actionMutate.mock.calls[0][0] as {
      action: string;
      id: string;
    };
    expect(payload.action).toBe("junk");
  });

  test("3. ArrowUp in hidden mode commits vip (arrowAction hidden+up)", () => {
    render(<TriagePage />);

    fireEvent.keyDown(document, { key: "ArrowUp" });

    expect(actionMutate).toHaveBeenCalledTimes(1);
    const payload = actionMutate.mock.calls[0][0] as {
      action: string;
      id: string;
    };
    expect(payload.action).toBe("vip");
  });

  test("4. ArrowDown in hidden mode commits delete (arrowAction hidden+down)", () => {
    render(<TriagePage />);

    fireEvent.keyDown(document, { key: "ArrowDown" });

    expect(actionMutate).toHaveBeenCalledTimes(1);
    const payload = actionMutate.mock.calls[0][0] as {
      action: string;
      id: string;
    };
    expect(payload.action).toBe("delete");
  });

  test("5. u key calls useUndo with the last action's job id", () => {
    render(<TriagePage />);

    // First commit an action via arrow key to set the last job.
    fireEvent.keyDown(document, { key: "ArrowRight" });

    // Now press u — should call undoMutate with that job id.
    fireEvent.keyDown(document, { key: "u" });

    expect(undoMutate).toHaveBeenCalledTimes(1);
    expect(undoMutate.mock.calls[0][0]).toEqual({ jobId: "job-1" });
  });

  test("6. a second keypress on the same card does not enqueue twice", () => {
    // Delete (ArrowDown in hidden mode) can never be guarded, so it takes no
    // wait-for-response lock: only the same-card lock stands in the way.
    actionMutate.mockImplementationOnce(() => inFlight);
    render(<TriagePage />);

    // Both keypresses inside one act(): the second runs before React
    // re-renders, so its handler still sees e1 as the active card.
    act(() => {
      fireEvent.keyDown(document, { key: "ArrowDown" });
      fireEvent.keyDown(document, { key: "ArrowDown" });
    });

    expect(actionMutate).toHaveBeenCalledTimes(1);
    expect((actionMutate.mock.calls[0][0] as { id: string }).id).toBe("e1");
  });

  test("6b. a may-guard action awaiting its response blocks a second may-guard action", () => {
    // ok-clean (ArrowRight) may be answered with a bulk guard, so it holds the
    // wait-for-response lock until it settles; this one never does.
    actionMutate.mockImplementationOnce(() => inFlight);
    render(<TriagePage />);

    fireEvent.keyDown(document, { key: "ArrowRight" });
    fireEvent.keyDown(document, { key: "ArrowRight" });

    expect(actionMutate).toHaveBeenCalledTimes(1);
  });

  test("7. keystroke ignored when target is an input element", () => {
    render(<TriagePage />);

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    fireEvent.keyDown(input, { key: "ArrowRight" });

    expect(actionMutate).not.toHaveBeenCalled();

    document.body.removeChild(input);
  });

  test("8. keystroke ignored when target is a textarea", () => {
    render(<TriagePage />);

    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);

    fireEvent.keyDown(textarea, { key: "ArrowRight" });

    expect(actionMutate).not.toHaveBeenCalled();

    document.body.removeChild(textarea);
  });

  test("8b. arrow-focus guard (FIX F): arrow keys are ignored when focus is on a control", () => {
    const { getByRole } = render(<TriagePage />);
    // Focus a button row control (e.g. the "Archive" button) and fire an
    // arrow keydown FROM it. The handler must not steal it into a triage action.
    const more = getByRole("button", { name: "OK" });
    more.focus();
    fireEvent.keyDown(more, { key: "ArrowRight" });
    expect(actionMutate).not.toHaveBeenCalled();
  });

  test("9. u key is a no-op when there is no previous action (no undo descriptor)", () => {
    render(<TriagePage />);

    // Press u without any prior action — should not call undoMutate.
    fireEvent.keyDown(document, { key: "u" });

    expect(undoMutate).not.toHaveBeenCalled();
  });

  test("10. U (uppercase) also triggers undo", () => {
    render(<TriagePage />);

    fireEvent.keyDown(document, { key: "ArrowRight" });
    fireEvent.keyDown(document, { key: "U" });

    expect(undoMutate).toHaveBeenCalledTimes(1);
    expect(undoMutate.mock.calls[0][0]).toEqual({ jobId: "job-1" });
  });

  test("11. O1: a shortcut fired after selecting a DIFFERENT queue row acts on the newly-selected card, not the stale first card", () => {
    // Desktop capability (hover + fine pointer) → the clickable queue pane
    // (Pane 1) renders, the same as deckui.test.tsx test 11.
    const orig = window.matchMedia;
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      media: "",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }) as unknown as typeof window.matchMedia;
    try {
      render(<TriagePage />);

      // Select the SECOND queue row (e2) the way a user clicks it — this does
      // NOT reorder the queue, it only highlights e2 as the active card.
      fireEvent.click(screen.getByRole("button", { name: /Name e2/ }));

      // Now fire a keyboard shortcut. It must act on e2 (the active/selected
      // card), not e1 (the original top card).
      fireEvent.keyDown(document, { key: "ArrowRight" });

      expect(actionMutate).toHaveBeenCalledTimes(1);
      const payload = actionMutate.mock.calls[0][0] as {
        action: string;
        id: string;
      };
      expect(payload.id).toBe("e2");
    } finally {
      window.matchMedia = orig;
    }
  });
});

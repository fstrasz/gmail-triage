import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { ActionResult, TriageEmail } from "../lib/api.ts";
import { eventDate, shortDate } from "../lib/format.ts";
import { applyTheme, loadTheme, saveTheme } from "../lib/theme.ts";

// ---- Triage hooks mocked as in triagekeys.test.tsx -------------------------
const hookState: {
  queue: {
    data: { emails: TriageEmail[]; counts: { left: number } } | undefined;
    isPending: boolean;
    isError: boolean;
  };
} = { queue: { data: undefined, isPending: false, isError: false } };

const actionMutate = vi.fn(
  (
    _p: unknown,
    opts?: { onSuccess?: (r: ActionResult) => void; onSettled?: () => void },
  ) => {
    opts?.onSuccess?.({
      ok: true,
      undo: {
        action: "archive",
        id: "e2",
        fromEmail: "e2@example.com",
        fromName: "Name e2",
        addedToList: false,
      },
    });
    opts?.onSettled?.();
  },
);

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
    hasUnsub: false,
    unsubUrl: null,
    unsubPost: null,
  };
}

// Matches only the queries listed — e.g. a touch iPad in portrait is
// tablet-wide but has no fine pointer and is under the workbench width.
function setMedia(matching: string[]) {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: matching.includes(q),
    media: q,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

const origMatchMedia = window.matchMedia;
afterEach(() => {
  window.matchMedia = origMatchMedia;
  vi.clearAllMocks();
});

describe("touch tablet (iPad portrait) layout", () => {
  test("shows a tappable queue beside the deck; tapping a row brings that card to the top and actions act on it", () => {
    setMedia(["(min-width: 768px)"]);
    hookState.queue = {
      data: {
        emails: [makeEmail("e1"), makeEmail("e2"), makeEmail("e3")],
        counts: { left: 3 },
      },
      isPending: false,
      isError: false,
    };
    render(<TriagePage />);

    // Touch deck controls (not the workbench column) are present…
    expect(
      screen.getByRole("button", { name: /more actions/i }),
    ).toBeInTheDocument();
    // …alongside a real, tappable queue.
    const row = screen.getByRole("button", { name: /Name e2/ });
    fireEvent.click(row);
    expect(row.getAttribute("aria-current")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    const payload = actionMutate.mock.calls.at(-1)?.[0] as { id: string };
    expect(payload.id).toBe("e2");
  });

  test("phone width renders no queue list", () => {
    setMedia([]);
    hookState.queue = {
      data: { emails: [makeEmail("e1"), makeEmail("e2")], counts: { left: 2 } },
      isPending: false,
      isError: false,
    };
    render(<TriagePage />);
    expect(screen.queryByRole("button", { name: /Name e2/ })).toBeNull();
  });

  test("the result of an action is stamped next to its message", () => {
    setMedia([]);
    hookState.queue = {
      data: { emails: [makeEmail("e1"), makeEmail("e2")], counts: { left: 2 } },
      isPending: false,
      isError: false,
    };
    render(<TriagePage />);
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    const status = screen.getByRole("status");
    expect(within(status).getByText("Archive")).toBeInTheDocument();
  });
});

describe("dates", () => {
  const now = new Date(2026, 9, 6, 12, 0);
  test("shortDate: time today, month+day this year, year otherwise, raw if unparseable", () => {
    expect(shortDate(new Date(2026, 9, 6, 9, 5).toISOString(), now)).toMatch(
      /9:05/,
    );
    expect(shortDate(new Date(2026, 2, 3).toISOString(), now)).toMatch(
      /Mar\s+3/,
    );
    expect(shortDate(new Date(2024, 2, 3).toISOString(), now)).toMatch(/2024/);
    expect(shortDate("not a date", now)).toBe("not a date");
    expect(shortDate(null, now)).toBe("");
  });

  test("eventDate never shifts a calendar date across the UTC offset", () => {
    // 2026-10-09 is a Friday in every time zone.
    expect(eventDate("2026-10-09")).toMatch(/Fri/);
    expect(eventDate("2026-10-09")).toMatch(/9/);
    expect(eventDate("next week")).toBe("next week");
    expect(eventDate(null)).toBe("");
  });
});

describe("theme preference", () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  test("pinning dark sets data-theme and persists; system clears both", () => {
    saveTheme("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(loadTheme()).toBe("dark");
    saveTheme("system");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(loadTheme()).toBe("system");
  });

  test("theme-color meta follows the pinned theme", () => {
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
    applyTheme("dark");
    expect(meta.content).toBe("#2b251e");
    applyTheme("light");
    expect(meta.content).toBe("#2f2822");
    meta.remove();
  });
});

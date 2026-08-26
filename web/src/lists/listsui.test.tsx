import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { ListsResponse } from "./listsApi.ts";

// ---------------------------------------------------------------------------
// Mock the feature's query hooks so ListsPage renders without a backend.
// (ReapplyBar talks to listsApi directly, so the guard-flow test stubs fetch.)
// ---------------------------------------------------------------------------

const addMutate = vi.fn();
const removeMutate = vi.fn();
const resetMutate = vi.fn();
const backupMutate = vi.fn();
const ruleAddMutate = vi.fn();
const ruleUpdateMutate = vi.fn();
const ruleToggleMutate = vi.fn();
const ruleDeleteMutate = vi.fn();

interface ListsState {
  data: ListsResponse | undefined;
  isPending: boolean;
  isError: boolean;
}

const state: { lists: ListsState } = {
  lists: { data: undefined, isPending: false, isError: false },
};

function mut(mutate: ReturnType<typeof vi.fn>) {
  return { mutate, isPending: false };
}

vi.mock("./listsQueries.ts", () => ({
  useLists: () => state.lists,
  useAddSender: () => mut(addMutate),
  useRemoveSender: () => mut(removeMutate),
  useResetBlocklist: () => mut(resetMutate),
  useCreateBackup: () => mut(backupMutate),
  useAddRule: () => mut(ruleAddMutate),
  useUpdateRule: () => mut(ruleUpdateMutate),
  useToggleRule: () => mut(ruleToggleMutate),
  useDeleteRule: () => mut(ruleDeleteMutate),
}));

// Import AFTER the mock is registered.
import { ListsPage } from "./ListsPage.tsx";

const emptyData: ListsResponse = {
  vip: [],
  oklist: [],
  blocklist: [],
  rules: [],
  backups: { single: null, named: [] },
  counts: { vip: 0, ok: 0, blocklist: 0 },
  nameFragmentationThreshold: 3,
};

beforeEach(() => {
  vi.clearAllMocks();
  state.lists = { data: undefined, isPending: false, isError: false };
});

describe("ListsPage", () => {
  test("loading state shows a skeleton", () => {
    state.lists = { data: undefined, isPending: true, isError: false };
    render(<ListsPage />);
    expect(screen.getByTestId("lists-skeleton")).toBeInTheDocument();
  });

  test("error state shows Reconnect Gmail with an /auth link", () => {
    state.lists = { data: undefined, isPending: false, isError: true };
    render(<ListsPage />);
    expect(screen.getByText(/reconnect gmail/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /reconnect/i }).getAttribute("href"),
    ).toBe("/auth");
  });

  test("empty state when no senders on any list", () => {
    state.lists = { data: emptyData, isPending: false, isError: false };
    render(<ListsPage />);
    expect(screen.getByTestId("lists-empty")).toBeInTheDocument();
  });

  test("renders a merged row with both VIP and Block remove controls", () => {
    state.lists = {
      data: {
        ...emptyData,
        vip: [{ email: "a@x.com", name: "Al", date: "2026-01-01" }],
        blocklist: [
          { email: "a@x.com", name: "Al", reason: "spam", date: "2026-01-02" },
        ],
      },
      isPending: false,
      isError: false,
    };
    render(<ListsPage />);
    expect(screen.getByText("a@x.com")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /remove .* from VIP/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /remove .* from Block/i }),
    ).toBeInTheDocument();
  });

  test("one address under several names shows each name on its own badge", () => {
    // Regression: the row used to render `memberships.find(m => m.name)` — the
    // FIRST name only — above a row of identical "OK" chips, so three REI
    // entries were indistinguishable and there was no way to tell which chip
    // removed which. The name was present only in the aria-label, so a screen
    // reader got more information than a sighted user.
    state.lists = {
      data: {
        ...emptyData,
        oklist: [
          { email: "rei_email@email.rei.com", name: "REI Membership", date: "" },
          { email: "rei_email@email.rei.com", name: "REI", date: "" },
          { email: "rei_email@email.rei.com", name: "REI Outlet", date: "" },
        ],
      },
      isPending: false,
      isError: false,
    };
    render(<ListsPage />);
    for (const n of ["REI Membership", "REI Outlet"]) {
      expect(screen.getByText(new RegExp(`OK · ${n}`))).toBeInTheDocument();
    }
    // Three distinct remove controls, one per entry, each naming its own entry.
    expect(
      screen.getByRole("button", { name: /remove REI Membership from OK/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /remove REI Outlet from OK/i }),
    ).toBeInTheDocument();
  });

  test("a row at/over the name-fragmentation threshold shows the standing marker", () => {
    // 3 distinct names for one address across VIP+OK, threshold 3 — must fire.
    state.lists = {
      data: {
        ...emptyData,
        nameFragmentationThreshold: 3,
        oklist: [
          { email: "rei_email@email.rei.com", name: "REI Membership", date: "" },
          { email: "rei_email@email.rei.com", name: "REI", date: "" },
          { email: "rei_email@email.rei.com", name: "REI Outlet", date: "" },
        ],
      },
      isPending: false,
      isError: false,
    };
    render(<ListsPage />);
    expect(screen.getByText(/fragmented/i)).toBeInTheDocument();
  });

  test("a row under the name-fragmentation threshold shows no marker", () => {
    // Only 2 distinct names — below the default threshold of 3.
    state.lists = {
      data: {
        ...emptyData,
        nameFragmentationThreshold: 3,
        vip: [{ email: "freequote@buckleyfence.com", name: "Buckley Fence", date: "" }],
        oklist: [
          { email: "freequote@buckleyfence.com", name: "Kyle Buckley", date: "" },
        ],
      },
      isPending: false,
      isError: false,
    };
    render(<ListsPage />);
    expect(screen.queryByText(/fragmented/i)).not.toBeInTheDocument();
  });

  test("a nameless entry is labelled 'any name', not left blank", () => {
    // A nameless entry matches EVERY display name from that address, which is
    // the fix for the inert-entry problem (O2). It must be visibly different
    // from a named entry, or the two cannot be told apart.
    // Uses "" rather than null deliberately: the stored JSON holds null, and
    // mergeLists normalises it with `e.name || ""` (listsApi.ts:324), so "" is
    // exactly what the component receives. NOTE: the raw entry types declare
    // `name: string` while the API really returns null — inaccurate, but latent,
    // since every consumer goes through that normalisation.
    state.lists = {
      data: {
        ...emptyData,
        oklist: [{ email: "a@x.com", name: "", date: "" }],
      },
      isPending: false,
      isError: false,
    };
    render(<ListsPage />);
    expect(screen.getByText(/OK · any name/)).toBeInTheDocument();
  });

  test("clicking a badge remove calls removeSender name-scoped", () => {
    state.lists = {
      data: { ...emptyData, vip: [{ email: "a@x.com", name: "Al", date: "" }] },
      isPending: false,
      isError: false,
    };
    render(<ListsPage />);
    fireEvent.click(
      screen.getByRole("button", { name: /remove .* from VIP/i }),
    );
    expect(removeMutate).toHaveBeenCalledWith({
      list: "vip",
      email: "a@x.com",
      name: "Al",
    });
  });

  test("Add-sender form submit calls addSender.mutate with the entered fields", () => {
    state.lists = { data: emptyData, isPending: false, isError: false };
    render(<ListsPage />);
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "new@x.com" },
    });
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "New" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
    expect(addMutate).toHaveBeenCalledTimes(1);
    expect(addMutate.mock.calls[0][0]).toMatchObject({
      list: "vip",
      email: "new@x.com",
      name: "New",
    });
  });

  test("add-sender form shows an inline notice when the add crosses the fragmentation threshold", () => {
    state.lists = { data: emptyData, isPending: false, isError: false };
    render(<ListsPage />);
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "new@x.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
    // The component passes { onSuccess } as the mutate() 2nd arg; invoke it the way
    // TanStack Query would once the POST /api/lists/add response comes back.
    const onSuccess = addMutate.mock.calls[0][1].onSuccess;
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "" },
    });
    act(() => {
      onSuccess({ ok: true, fragmented: true });
    });
    expect(screen.getByRole("status")).toHaveTextContent(/new@x\.com/i);
  });

  test("accepts a domain-wildcard entry (@domain); Email field is not type=email", () => {
    state.lists = { data: emptyData, isPending: false, isError: false };
    render(<ListsPage />);
    const emailInput = screen.getByLabelText("Email");
    // Regression: type="email" blocked leading-"@" domain wildcards, a first-class feature.
    expect(emailInput).not.toHaveAttribute("type", "email");
    fireEvent.change(emailInput, { target: { value: "@mail.anthropic.com" } });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
    expect(addMutate).toHaveBeenCalledTimes(1);
    expect(addMutate.mock.calls[0][0]).toMatchObject({
      list: "vip",
      email: "@mail.anthropic.com",
    });
  });

  test("reapply guard flow: clicking a reapply button opens the guard dialog", async () => {
    state.lists = { data: emptyData, isPending: false, isError: false };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: () =>
        Promise.resolve({
          ok: false,
          guard: true,
          count: 300,
          message: "This will reapply ~300",
        }),
    } as unknown as Response);

    render(<ListsPage />);
    fireEvent.click(screen.getByRole("button", { name: /^VIP$/ }));
    expect(
      await screen.findByText(/this will reapply ~300/i),
    ).toBeInTheDocument();
  });
});

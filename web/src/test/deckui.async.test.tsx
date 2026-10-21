import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { ActionResult, QueueStatus, TriageEmail } from "../lib/api.ts";

// ---------------------------------------------------------------------------
// REAL coordination test: render TriagePage inside a real QueryClientProvider
// so useQueue / useAction / useQueueStatus run for real. Only the network
// boundary (../lib/api.ts) is mocked, and postAction resolves ASYNCHRONOUSLY
// under test control — this exercises the genuine interleave of the cache
// updates, the deck reducer and the queue status poll.
// ---------------------------------------------------------------------------

const api = vi.hoisted(() => ({
  getQueue: vi.fn(),
  getNext: vi.fn(),
  getBodyUrl: vi.fn((id: string) => `/api/triage/body?id=${id}`),
  postAction: vi.fn(),
  postUndo: vi.fn(),
  getQueueStatus: vi.fn(),
  retryJob: vi.fn(),
  dismissJob: vi.fn(),
}));

vi.mock("../lib/api.ts", () => api);

// Import AFTER the mock is registered.
import { TriagePage } from "../triage/TriagePage.tsx";

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

// Ten unrelated cards: keeps a deck at or above the low-water mark (10), so no
// low-water refetch runs unless a test wants one.
function filler(): TriageEmail[] {
  return Array.from({ length: 10 }, (_, i) => makeEmail(`f${i}`));
}

function queueOf(emails: TriageEmail[]) {
  return { emails, counts: { left: emails.length } };
}

function status(over: Partial<QueueStatus> = {}): QueueStatus {
  return {
    ok: true,
    actions: 0,
    emailsLeft: 0,
    counting: 0,
    activeIds: [],
    failed: [],
    paused: null,
    bulkGuardEnabled: true,
    ...over,
  };
}

function queued(jobId: string): ActionResult {
  return { ok: true, queued: true, jobId };
}

/** A manually-resolvable deferred so the test controls WHEN a call resolves. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderWithClient(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const utils = render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
  return { ...utils, client };
}

// The workbench layout: every action is a labelled button acting on the
// selected card, and the selection moves to the next card after each action.
const origMatchMedia = window.matchMedia;
function setDesktop() {
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
}

// A card is in the deck when its queue row (a button named by sender + subject)
// renders. Text alone is not enough: the desktop status shows the acted card.
// hidden:true so rows still count while a modal dialog hides the background.
const shown = (subject: string) =>
  screen.queryAllByRole("button", { name: new RegExp(subject), hidden: true })
    .length > 0;

// Query results reach React through notifyManager's setTimeout(0) batching.
const flush = () => act(() => new Promise((r) => setTimeout(r, 5)));

// For tests that fake only the poll interval (setInterval): advance it, then
// let React Query's notify batching (real setTimeout) reach React.
const tick = async (ms: number) => {
  await act(() => vi.advanceTimersByTimeAsync(ms));
  await flush();
  await flush();
};

const cachedIds = (client: QueryClient) =>
  (
    client.getQueryData(["triage", "queue", { hideListed: true, limit: 25 }]) as
      | { emails: TriageEmail[] }
      | undefined
  )?.emails.map((e) => e.id);

beforeEach(() => {
  vi.clearAllMocks();
  // Reset, not just clear: a test that fails mid-way can leave queued
  // mockReturnValueOnce values that the next test would otherwise receive.
  for (const fn of [api.getQueue, api.getQueueStatus, api.postAction, api.postUndo]) {
    fn.mockReset();
  }
  api.getQueue.mockResolvedValue(queueOf([makeEmail("e1"), makeEmail("e2")]));
  api.getQueueStatus.mockResolvedValue(status());
  api.postUndo.mockResolvedValue({ ok: true, state: "cancelled" });
  api.retryJob.mockResolvedValue(undefined);
  api.dismissJob.mockResolvedValue(undefined);
});

afterEach(() => {
  window.matchMedia = origMatchMedia;
  vi.useRealTimers();
});

describe("TriagePage / real React-Query interleave", () => {
  test("guard: card is restored to the top of the deck and GuardDialog opens after an ASYNC guard resolve", async () => {
    const d = deferred<ActionResult>();
    api.postAction.mockReturnValueOnce(d.promise);

    renderWithClient(<TriagePage />);

    // Wait for the queue to load and the deck to render the top card (e1).
    await screen.findByText("Subject e1");

    fireEvent.click(screen.getByRole("button", { name: "OK" }));

    // Resolve the action with a guard AFTER the optimistic cache removal.
    d.resolve({
      ok: false,
      guard: { count: 250, message: "250 emails will be archived" },
    });

    // The dialog must be about a card that is STILL present: e1 stays on top.
    await screen.findByText(/250 emails will be archived/i);
    expect(screen.getByText("Subject e1")).toBeInTheDocument();

    // Confirming re-posts for THAT SAME card with confirmed:true. The server
    // now excludes e1 from the queue, so any refetch returns [e2].
    api.getQueue.mockResolvedValue(queueOf([makeEmail("e2")]));
    api.postAction.mockResolvedValueOnce(queued("job-1"));
    fireEvent.click(screen.getByRole("button", { name: /^confirm$/i }));

    await waitFor(() => {
      const last = api.postAction.mock.calls.at(-1)![0] as {
        confirmed?: boolean;
        action: string;
        id: string;
      };
      expect(last.confirmed).toBe(true);
      expect(last.action).toBe("ok");
      expect(last.id).toBe("e1");
    });

    // On confirmed-success e1 is removed and stays removed (e2 is now the top).
    await screen.findByText("Subject e2");
    expect(screen.queryAllByText("Subject e1")).toHaveLength(0);
    expect(screen.getByRole("status")).toBeInTheDocument();

    // DECK-2: the confirmed-success path ALSO announces, reading the correct
    // new top (e2), not a stale closure value.
    await waitFor(() => {
      const live = document.querySelector('[aria-live="polite"]');
      expect(live!.textContent).toMatch(/Name e2/);
      expect(live!.textContent).toMatch(/Subject e2/);
    });
  });

  test("auth: card is restored and the Reconnect Gmail state shows after an ASYNC gmail_auth resolve", async () => {
    const d = deferred<ActionResult>();
    api.postAction.mockReturnValueOnce(d.promise);

    renderWithClient(<TriagePage />);
    await screen.findByText("Subject e1");

    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    d.resolve({ ok: false, error: "gmail_auth" });

    // Distinct Reconnect state shows (not the empty "Inbox triaged").
    await screen.findByText(/reconnect gmail/i);
    expect(screen.queryByText(/inbox triaged/i)).not.toBeInTheDocument();

    // The just-acted card must be RESTORED to the visible deck.
    expect(screen.getByText("Subject e1")).toBeInTheDocument();
  });
});

describe("TriagePage / non-blocking action queue", () => {
  test("1. two actions on different cards while the first enqueue is unresolved", async () => {
    setDesktop();
    api.getQueue.mockResolvedValue(
      queueOf([makeEmail("e1"), makeEmail("e2"), ...filler()]),
    );
    const first = deferred<ActionResult>();
    const second = deferred<ActionResult>();
    api.postAction
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    renderWithClient(<TriagePage />);
    await screen.findAllByText("Subject e1");

    fireEvent.click(screen.getByRole("button", { name: "Archive" })); // e1
    fireEvent.click(screen.getByRole("button", { name: "Archive" })); // e2

    await waitFor(() => expect(api.postAction).toHaveBeenCalledTimes(2));
    expect(api.postAction.mock.calls.map((c) => c[0].id)).toEqual([
      "e1",
      "e2",
    ]);
    expect(shown("Subject e1")).toBe(false);
    expect(shown("Subject e2")).toBe(false);
  });

  test("2. junk removes every card from that sender and name, not other names", async () => {
    setDesktop();
    const x = { fromEmail: "x@example.com" };
    api.getQueue.mockResolvedValue(
      queueOf([
        makeEmail("j1", { ...x, fromName: "X" }),
        makeEmail("j2", { ...x, fromName: "X" }),
        makeEmail("j3", { ...x, fromName: "Other" }),
        ...filler(),
      ]),
    );
    api.postAction.mockResolvedValueOnce(queued("job-1"));
    api.getQueueStatus.mockResolvedValue(
      status({ actions: 1, activeIds: ["job-1"], counting: 1 }),
    );

    renderWithClient(<TriagePage />);
    await screen.findAllByText("Subject j1");

    fireEvent.click(screen.getByRole("button", { name: "Junk" }));

    expect(shown("Subject j1")).toBe(false);
    expect(shown("Subject j2")).toBe(false);
    expect(shown("Subject j3")).toBe(true);
    await waitFor(() => expect(api.postAction).toHaveBeenCalledTimes(1));
    expect(api.postAction.mock.calls[0][0]).toMatchObject({
      id: "j1",
      action: "junk",
    });
  });

  for (const outcome of ["guard", "reject"] as const) {
    test(`3. a guard on one action does not resurrect another action's cards (A ${outcome})`, async () => {
      setDesktop();
      const a = { fromEmail: "a@example.com", fromName: "A" };
      api.getQueue.mockResolvedValue(
        queueOf([
          makeEmail("a1", a),
          makeEmail("a2", a),
          makeEmail("b1"),
          ...filler(),
        ]),
      );
      // Guard off: junk is not may-guard, so it may run while A awaits.
      api.getQueueStatus.mockResolvedValue(status({ bulkGuardEnabled: false }));
      const dA = deferred<ActionResult>();
      api.postAction
        .mockReturnValueOnce(dA.promise)
        .mockResolvedValueOnce(queued("job-b"));

      const { client } = renderWithClient(<TriagePage />);
      await screen.findAllByText("Subject a1");
      await waitFor(() => expect(api.getQueueStatus).toHaveBeenCalled());
      await flush();

      const statusCalls = api.getQueueStatus.mock.calls.length;
      const deckCalls = api.getQueue.mock.calls.length;
      fireEvent.click(screen.getByRole("button", { name: "Delete All" })); // a1+a2
      expect(shown("Subject a2")).toBe(false);
      // Server truth once B is enqueued: its card is no longer in the queue.
      api.getQueue.mockResolvedValue(
        queueOf([makeEmail("a1", a), makeEmail("a2", a), ...filler()]),
      );
      fireEvent.click(screen.getByRole("button", { name: "Junk" })); // b1
      await waitFor(() => expect(api.postAction).toHaveBeenCalledTimes(2));

      // B's enqueue lands, and a status fetched after it no longer lists B
      // (it already finished): B's suppression lifts, the deck refetches and
      // that fresh data (without b1) lands BEFORE A answers. From then on
      // nothing but the cache can bring b1 back.
      await waitFor(() =>
        expect(api.getQueueStatus.mock.calls.length).toBeGreaterThan(
          statusCalls,
        ),
      );
      await waitFor(() =>
        expect(api.getQueue.mock.calls.length).toBeGreaterThan(deckCalls),
      );
      await flush();
      expect(cachedIds(client)).not.toContain("b1");

      if (outcome === "guard") {
        dA.resolve({
          ok: false,
          guard: { count: null, message: "Delete all from A?" },
        });
        await screen.findByText("Delete all from A?");
      } else {
        dA.reject(new Error("500"));
      }

      await waitFor(() => expect(shown("Subject a1")).toBe(true));
      // B's suppression has lifted (its job is not active and fresh deck data
      // has landed): from here only the cache decides whether b1 shows. One
      // more status poll and render pass, so a resurrected b1 would surface.
      await flush();
      await act(() => client.refetchQueries({ queryKey: ["queue", "status"] }));
      await flush();
      expect(shown("Subject a2")).toBe(true);
      expect(shown("Subject b1")).toBe(false);
      expect(cachedIds(client)).toContain("a1");
      expect(cachedIds(client)).not.toContain("b1");
    });
  }

  test("4. a refetch racing an enqueue does not resurrect the card", async () => {
    setDesktop();
    api.getQueue.mockResolvedValue(queueOf([makeEmail("b1"), ...filler()]));
    const dB = deferred<ActionResult>();
    api.postAction.mockReturnValueOnce(dB.promise);

    const { client } = renderWithClient(<TriagePage />);
    await screen.findAllByText("Subject b1");

    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    expect(shown("Subject b1")).toBe(false);

    // A deck refetch (e.g. window focus) that the server answered before the
    // enqueue landed: it still contains b1.
    await act(() => client.refetchQueries({ queryKey: ["triage", "queue"] }));
    expect(cachedIds(client)).toContain("b1");
    expect(shown("Subject b1")).toBe(false);

    // The enqueue lands and the job is active: still hidden.
    api.getQueueStatus.mockResolvedValue(
      status({ actions: 1, activeIds: ["job-b"], emailsLeft: 1 }),
    );
    dB.resolve(queued("job-b"));
    await waitFor(() => expect(api.getQueueStatus.mock.calls.length).toBe(2));
    await flush();
    expect(shown("Subject b1")).toBe(false);

    // The job finishes: the next status poll drops it from activeIds while
    // the cache still holds the stale copy of b1. The deck must refetch, and
    // b1 must stay hidden until that fresh data (without b1) has landed.
    const truth = deferred<ReturnType<typeof queueOf>>();
    // Server truth from here on (b1's job is done), for this fetch and any
    // later refill.
    api.getQueue.mockResolvedValue(queueOf(filler()));
    api.getQueue.mockReturnValueOnce(truth.promise);
    api.getQueueStatus.mockResolvedValue(status());
    const deckCalls = api.getQueue.mock.calls.length;
    await act(() => client.refetchQueries({ queryKey: ["queue", "status"] }));
    await flush();
    expect(api.getQueue.mock.calls.length).toBe(deckCalls + 1);
    expect(cachedIds(client)).toContain("b1"); // stale copy still cached
    expect(shown("Subject b1")).toBe(false);

    // While that truth fetch is still in flight, act on another card. Its
    // optimistic cache edit is not a fetch: it must not count as fresh data
    // and release b1 from the stale cache.
    api.postAction.mockResolvedValue(queued("job-x"));
    api.getQueueStatus.mockResolvedValue(
      status({ actions: 1, activeIds: ["job-x"], emailsLeft: 1 }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Archive" })); // f0
    await waitFor(() => expect(api.postAction).toHaveBeenCalledTimes(2));
    await flush();
    expect(api.getQueue.mock.calls.length).toBe(deckCalls + 1); // still deferred
    expect(cachedIds(client)).toContain("b1");
    expect(shown("Subject b1")).toBe(false);

    truth.resolve(queueOf(filler()));
    await flush();
    expect(cachedIds(client)).not.toContain("b1");
    expect(shown("Subject b1")).toBe(false);
  });

  test("4b. a mount with a full deck fetches the queue exactly once", async () => {
    api.getQueue.mockResolvedValue(
      queueOf(Array.from({ length: 15 }, (_, i) => makeEmail(`m${i}`))),
    );
    renderWithClient(<TriagePage />);
    await screen.findByText("Subject m0");
    await flush();
    await flush();
    expect(api.getQueue).toHaveBeenCalledTimes(1);
  });

  test("5. low-water refetch still completes when the user keeps clicking", async () => {
    setDesktop();
    const refetch = deferred<ReturnType<typeof queueOf>>();
    api.getQueue
      .mockResolvedValueOnce(
        queueOf([makeEmail("e1"), makeEmail("e2"), makeEmail("e3")]),
      )
      .mockReturnValueOnce(refetch.promise);
    api.postAction.mockResolvedValue(queued("job-1"));
    // The archive job is still running throughout.
    api.getQueueStatus.mockResolvedValue(
      status({ actions: 1, emailsLeft: 1, activeIds: ["job-1"] }),
    );

    renderWithClient(<TriagePage />);
    await screen.findAllByText("Subject e1");
    // Three cards is below the low-water mark: a refetch is now in flight.
    await waitFor(() => expect(api.getQueue).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole("button", { name: "Archive" })); // e1
    await waitFor(() => expect(api.postAction).toHaveBeenCalledTimes(1));

    refetch.resolve(
      queueOf([makeEmail("e2"), makeEmail("e3"), makeEmail("n1")]),
    );
    expect((await screen.findAllByText("Subject n1")).length).toBeGreaterThan(
      0,
    );
    expect(shown("Subject e1")).toBe(false);
  });

  test("6. counter shows jobs present at mount", async () => {
    api.getQueueStatus.mockResolvedValue(
      status({
        actions: 3,
        emailsLeft: 1240,
        counting: 1,
        activeIds: ["j1", "j2", "j3"],
      }),
    );
    renderWithClient(<TriagePage />);
    await screen.findByText("Subject e1"); // header layout settled
    const line = "3 actions · 1,240 emails left (1 counting)";
    await screen.findByText(line);
    expect(screen.getByText(line)).toBeInTheDocument();
  });

  test("6b. counter is hidden when nothing is queued and nothing failed", async () => {
    renderWithClient(<TriagePage />);
    await screen.findByText("Subject e1");
    await waitFor(() => expect(api.getQueueStatus).toHaveBeenCalled());
    await flush();
    expect(screen.queryByText(/emails left/)).toBeNull();
  });

  test("7. counter polls every 2s while actions > 0 and stops at 0", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    api.getQueue.mockResolvedValue(queueOf(filler()));
    const busy = status({ actions: 1, emailsLeft: 5, activeIds: ["j1"] });
    api.getQueueStatus
      .mockResolvedValueOnce(busy)
      .mockResolvedValueOnce(busy)
      .mockResolvedValue(status());

    renderWithClient(<TriagePage />);
    await tick(0);
    expect(api.getQueueStatus).toHaveBeenCalledTimes(1);
    expect(screen.getByText("1 action · 5 emails left")).toBeInTheDocument();

    await tick(2000);
    expect(api.getQueueStatus).toHaveBeenCalledTimes(2);

    await tick(2000);
    expect(api.getQueueStatus).toHaveBeenCalledTimes(3);
    expect(screen.queryByText(/emails left/)).toBeNull();

    await tick(6000);
    expect(api.getQueueStatus).toHaveBeenCalledTimes(3);
  });

  test("8. undo posts jobId and refetches the deck", async () => {
    setDesktop();
    api.getQueue.mockResolvedValue(queueOf([makeEmail("e1"), ...filler()]));
    api.postAction.mockResolvedValueOnce(queued("job-1"));
    // The job is pending, so only the undo can cause the deck refetch.
    api.getQueueStatus.mockResolvedValue(
      status({ actions: 1, emailsLeft: 1, activeIds: ["job-1"] }),
    );

    renderWithClient(<TriagePage />);
    await screen.findAllByText("Subject e1");
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    const undo = await screen.findByRole("button", {
      name: "Undo last action",
    });
    const deckCalls = api.getQueue.mock.calls.length;

    fireEvent.click(undo);

    await waitFor(() =>
      expect(api.postUndo).toHaveBeenCalledWith({ jobId: "job-1" }),
    );
    await waitFor(() =>
      expect(api.getQueue.mock.calls.length).toBeGreaterThan(deckCalls),
    );
  });

  test("8b. undo-requested refetches again when the job leaves activeIds", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    setDesktop();
    api.getQueue.mockResolvedValue(queueOf([makeEmail("e1"), ...filler()]));
    api.postAction.mockResolvedValueOnce(queued("job-1"));
    api.postUndo.mockResolvedValue({ ok: true, state: "undo-requested" });
    const running = status({ actions: 1, emailsLeft: 1, activeIds: ["job-1"] });
    api.getQueueStatus.mockResolvedValue(running);

    renderWithClient(<TriagePage />);
    await tick(0);
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    await tick(0);
    expect(api.getQueueStatus).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("button", { name: "Undo last action" }));
    await tick(0);
    expect(api.postUndo).toHaveBeenCalledWith({ jobId: "job-1" });
    // The undo's own status refetch, while the job still runs.
    expect(api.getQueueStatus).toHaveBeenCalledTimes(3);
    const deckCalls = api.getQueue.mock.calls.length;

    // The job finishes (and its undo is applied): the next poll drops it.
    api.getQueueStatus.mockResolvedValue(status());
    await tick(2000);
    expect(api.getQueueStatus).toHaveBeenCalledTimes(4);
    expect(api.getQueue.mock.calls.length).toBeGreaterThan(deckCalls);
  });

  test("8c. a failed undo says so in the status area", async () => {
    setDesktop();
    api.getQueue.mockResolvedValue(queueOf([makeEmail("e1"), ...filler()]));
    api.postAction.mockResolvedValueOnce(queued("job-1"));
    api.postUndo.mockRejectedValue(new Error("postUndo failed: 400"));

    renderWithClient(<TriagePage />);
    await screen.findAllByText("Subject e1");
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Undo last action" }),
    );
    expect(
      await screen.findByText("Undo failed — the action could not be undone"),
    ).toBeInTheDocument();
  });

  test("9. a late response does not replace the newer toast", async () => {
    setDesktop();
    api.getQueue.mockResolvedValue(
      queueOf([makeEmail("e1"), makeEmail("e2"), ...filler()]),
    );
    const dA = deferred<ActionResult>();
    api.postAction
      .mockReturnValueOnce(dA.promise)
      .mockResolvedValueOnce(queued("job-b"));

    renderWithClient(<TriagePage />);
    await screen.findAllByText("Subject e1");
    fireEvent.click(screen.getByRole("button", { name: "Archive" })); // A: e1
    fireEvent.click(screen.getByRole("button", { name: "Delete" })); // B: e2
    await screen.findByRole("button", { name: "Undo last action" });

    dA.resolve(queued("job-a"));
    await flush();

    const toast = screen.getByRole("status");
    expect(within(toast).getByText(/Deleted — queued/)).toBeInTheDocument();
    fireEvent.click(
      within(toast).getByRole("button", { name: "Undo last action" }),
    );
    await waitFor(() =>
      expect(api.postUndo).toHaveBeenCalledWith({ jobId: "job-b" }),
    );
  });

  test("10. failed job shows Retry and Dismiss; Dismiss confirms first", async () => {
    api.getQueueStatus.mockResolvedValue(
      status({
        failed: [
          {
            id: "f1",
            action: "junk",
            fromEmail: "x@example.com",
            fromName: "Sender X",
            error: "boom",
          },
        ],
      }),
    );
    renderWithClient(<TriagePage />);
    await screen.findByText("Subject e1"); // header layout settled
    await screen.findByText(/1 failed/);

    fireEvent.click(screen.getByRole("button", { name: "Retry Sender X" }));
    await waitFor(() => expect(api.retryJob).toHaveBeenCalledWith("f1"));

    // Dismiss names the job and what cannot be reversed; Cancel does nothing.
    fireEvent.click(screen.getByRole("button", { name: "Dismiss Sender X" }));
    const title = "Dismiss the failed Junk for Sender X?";
    expect(await screen.findByText(title)).toBeInTheDocument();
    expect(
      screen.getByText("It will not be retried, and this cannot be undone."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByText(title)).toBeNull());
    expect(api.dismissJob).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss Sender X" }));
    fireEvent.click(await screen.findByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(api.dismissJob).toHaveBeenCalledWith("f1"));
  });

  test("10b. paused gmail_auth shows Reconnect banner", async () => {
    api.getQueueStatus.mockResolvedValue(
      status({ actions: 1, activeIds: ["j1"], paused: "gmail_auth" }),
    );
    renderWithClient(<TriagePage />);
    await screen.findByText("Subject e1");
    expect(await screen.findByText(/reconnect gmail/i)).toBeInTheDocument();
  });
});

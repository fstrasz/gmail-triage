import { describe, expect, test } from "vitest";
import type { TriageEmail } from "../lib/api.ts";
import { deckReducer } from "../triage/deckReducer.ts";
import { arrowAction, swipeAction, TAP_GROUPS } from "../triage/swipeMap.ts";

// ---------------------------------------------------------------------------
// swipeMap — verbatim from task brief
// ---------------------------------------------------------------------------

const ALL9 = [
  "ok",
  "vip",
  "ok-clean",
  "vip-clean",
  "junk",
  "unsub",
  "archive",
  "delete",
  "delete-all",
  "archive-all",
  "review",
];

test("hidden", () => {
  expect(swipeAction("hidden", "right")).toBe("ok-clean");
  expect(swipeAction("hidden", "left")).toBe("unsub");
  expect(swipeAction("hidden", "up")).toBe("vip");
  expect(swipeAction("hidden", "down")).toBe("delete");
  expect(TAP_GROUPS.hidden).toEqual({
    message: ["ok", "vip-clean", "archive-all"],
    sender: [],
  });
});

test("arrow keys keep the per-message mapping; Delete All and Unsub have no key", () => {
  expect(arrowAction("hidden", "right")).toBe("ok-clean");
  expect(arrowAction("hidden", "left")).toBe("junk");
  expect(arrowAction("hidden", "up")).toBe("vip");
  expect(arrowAction("hidden", "down")).toBe("delete");
  for (const m of ["hidden", "shown"] as const) {
    for (const d of ["left", "right", "up", "down"] as const) {
      expect(["delete-all", "unsub"]).not.toContain(arrowAction(m, d));
    }
  }
});

test("shown: touch layout matches hidden; arrow keys keep the shown mapping", () => {
  for (const d of ["left", "right", "up", "down"] as const) {
    expect(swipeAction("shown", d)).toBe(swipeAction("hidden", d));
  }
  expect(TAP_GROUPS.shown).toEqual(TAP_GROUPS.hidden);
  expect(arrowAction("shown", "right")).toBe("archive");
  expect(arrowAction("shown", "left")).toBe("junk");
  expect(arrowAction("shown", "up")).toBe("ok");
  expect(arrowAction("shown", "down")).toBe("review");
});

test("a11y parity: tap groups hold exactly the actions no swipe covers (DECK-3)", () => {
  for (const m of ["hidden", "shown"] as const) {
    const swipes = (["left", "right", "up", "down"] as const).map((d) =>
      swipeAction(m, d),
    );
    const taps = [...TAP_GROUPS[m].message, ...TAP_GROUPS[m].sender];
    // No action is both tapped and swiped; together they are every action the
    // mode offers on touch. Touch deliberately omits Junk, Archive and Review
    // (operator direction, 2026-10-20 / 2026-10-22); Delete All is reached via
    // Delete's prompt. Desktop still offers them all as buttons.
    const omitted = ["junk", "delete-all", "archive", "review"];
    expect(taps.filter((a) => swipes.includes(a))).toEqual([]);
    expect(new Set([...taps, ...swipes, ...omitted])).toEqual(new Set(ALL9));
    expect(taps.length + swipes.length + omitted.length).toBe(ALL9.length);
  }
});

// ---------------------------------------------------------------------------
// deckReducer
// ---------------------------------------------------------------------------

function makeEmail(id: string): TriageEmail {
  return {
    id,
    threadId: null,
    fromEmail: `${id}@example.com`,
    fromName: id,
    subject: `Subject ${id}`,
    snippet: "",
    date: "2026-01-01",
    tier: null,
    ruleLabels: [],
    hasUnsub: false,
    unsubUrl: null,
    unsubPost: null,
  };
}

const e1 = makeEmail("e1");
const e2 = makeEmail("e2");
const e3 = makeEmail("e3");

const base = (
  over: Partial<import("../triage/deckReducer.ts").DeckState> = {},
) => ({
  cards: [] as TriageEmail[],
  removed: [] as { card: TriageEmail; index: number }[],
  mode: "hidden" as const,
  selectedId: null as string | null,
  ...over,
});

describe("deckReducer", () => {
  test("load initialises cards, empty removed, selects the first card", () => {
    const state = deckReducer(base(), { type: "load", cards: [e1, e2, e3] });
    expect(state.cards).toEqual([e1, e2, e3]);
    expect(state.removed).toEqual([]);
    expect(state.selectedId).toBe("e1");
    expect(state.mode).toBe("hidden");
  });

  test("select highlights in place — does NOT reorder the queue", () => {
    const init = base({ cards: [e1, e2, e3], selectedId: "e1" });
    const state = deckReducer(init, { type: "select", id: "e3" });
    expect(state.cards).toEqual([e1, e2, e3]); // unchanged order
    expect(state.selectedId).toBe("e3");
  });

  test("act removes the active (selected) card and keeps the cursor at that position", () => {
    // Select the middle card, act on it → it's removed, the one below shifts up
    // into its slot and becomes selected ("queue moves up").
    const init = base({ cards: [e1, e2, e3], selectedId: "e2" });
    const state = deckReducer(init, { type: "act", action: "ok", id: "e2" });
    expect(state.cards).toEqual([e1, e3]);
    expect(state.removed).toEqual([{ card: e2, index: 1 }]);
    expect(state.selectedId).toBe("e3"); // position 1, now e3
  });

  test("act without id removes the selected card (defaults to selection, then top)", () => {
    const init = base({ cards: [e1, e2, e3], selectedId: "e1" });
    const state = deckReducer(init, { type: "act", action: "ok" });
    expect(state.cards).toEqual([e2, e3]);
    expect(state.removed).toEqual([{ card: e1, index: 0 }]);
    expect(state.selectedId).toBe("e2");
  });

  test("act on the last card clamps the selection to the new last", () => {
    const init = base({ cards: [e1, e2, e3], selectedId: "e3" });
    const state = deckReducer(init, { type: "act", action: "ok", id: "e3" });
    expect(state.cards).toEqual([e1, e2]);
    expect(state.selectedId).toBe("e2");
  });

  test("undo restores the removed card to its ORIGINAL position and reselects it", () => {
    // Remove the middle card, then undo: it returns to index 1, selected.
    const acted = deckReducer(base({ cards: [e1, e2, e3], selectedId: "e2" }), {
      type: "act",
      action: "ok",
      id: "e2",
    });
    const state = deckReducer(acted, { type: "undo" });
    expect(state.cards).toEqual([e1, e2, e3]);
    expect(state.selectedId).toBe("e2");
    expect(state.removed).toEqual([]);
  });

  test("undo is a no-op when removed[] is empty", () => {
    const init = base({ cards: [e1, e2], selectedId: "e1" });
    expect(deckReducer(init, { type: "undo" })).toEqual(init);
  });

  test("act on a single-card queue empties it and clears selection", () => {
    const init = base({ cards: [e1], selectedId: "e1" });
    const state = deckReducer(init, { type: "act", action: "vip", id: "e1" });
    expect(state.cards).toEqual([]);
    expect(state.selectedId).toBeNull();
    expect(state.removed).toEqual([{ card: e1, index: 0 }]);
  });

  test("setMode switches mode and leaves cards/removed/selection unchanged", () => {
    const init = base({ cards: [e1, e2], selectedId: "e2" });
    const state = deckReducer(init, { type: "setMode", mode: "shown" });
    expect(state.mode).toBe("shown");
    expect(state.cards).toEqual(init.cards);
    expect(state.selectedId).toBe("e2");
  });

  // `load` RECONCILES incoming server data with the local optimistic removed[]
  // stack (it re-fires mid-action from useAction.onMutate's cache filter). A
  // removed card back in the incoming queue was restored server-side → drop it;
  // one still absent stays optimistically removed.
  test("load reconciles: drops removed cards that reappear, keeps those still absent", () => {
    const init = base({
      cards: [e1],
      removed: [
        { card: e2, index: 0 },
        { card: e3, index: 1 },
      ],
      selectedId: "e1",
    });
    const state = deckReducer(init, { type: "load", cards: [e3] });
    expect(state.cards).toEqual([e3]); // e3 reappeared, e2 still filtered
    expect(state.removed).toEqual([{ card: e2, index: 0 }]);
  });

  test("load preserves removed[] when the acted card is absent (in-flight removal)", () => {
    const init = base({
      cards: [e2],
      removed: [{ card: e1, index: 0 }],
      selectedId: "e2",
    });
    const state = deckReducer(init, { type: "load", cards: [e2] });
    expect(state.cards).toEqual([e2]);
    expect(state.removed).toEqual([{ card: e1, index: 0 }]);
  });

  test("act with ids removes the group and keeps the cursor position", () => {
    const e4 = makeEmail("e4");
    const init = base({ cards: [e1, e2, e3, e4], selectedId: "e2" });
    const state = deckReducer(init, {
      type: "act",
      action: "junk",
      id: "e2",
      ids: ["e2", "e4"],
    });
    expect(state.cards).toEqual([e1, e3]);
    expect(state.removed.map((r) => r.card.id)).toEqual(["e2", "e4"]);
    expect(state.removed.map((r) => r.index)).toEqual([1, 3]);
    // Cursor stays at the acted card's old index: e3 now sits there.
    expect(state.selectedId).toBe("e3");
  });

  test("restore re-inserts only the given ids", () => {
    const e4 = makeEmail("e4");
    const acted = deckReducer(
      base({ cards: [e1, e2, e3, e4], selectedId: "e2" }),
      { type: "act", action: "junk", id: "e2", ids: ["e2", "e4"] },
    );
    const state = deckReducer(acted, { type: "restore", ids: ["e4"] });
    expect(state.cards).toEqual([e1, e3, e4]);
    expect(state.removed.map((r) => r.card.id)).toEqual(["e2"]);
    const all = deckReducer(acted, { type: "restore", ids: ["e2", "e4"] });
    expect(all.cards).toEqual([e1, e2, e3, e4]);
    expect(all.removed).toEqual([]);
  });

  test("load keeps keepRemoved ids suppressed when they reappear", () => {
    const init = base({
      cards: [e3],
      removed: [
        { card: e1, index: 0 },
        { card: e2, index: 1 },
      ],
      selectedId: "e3",
    });
    const state = deckReducer(init, {
      type: "load",
      cards: [e1, e2, e3],
      keepRemoved: ["e1"],
    });
    // e1 is still being enqueued: suppressed. e2 reappeared without being
    // kept: treated as restored server-side, as before.
    expect(state.cards).toEqual([e2, e3]);
    expect(state.removed).toEqual([{ card: e1, index: 0 }]);
  });

  test("reducer is immutable — original state untouched after act", () => {
    const init = base({ cards: [e1, e2], selectedId: "e1" });
    const origCards = init.cards;
    deckReducer(init, { type: "act", action: "archive", id: "e1" });
    expect(init.cards).toBe(origCards);
    expect(init.cards.length).toBe(2);
  });
});

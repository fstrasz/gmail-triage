import { beforeEach, describe, expect, test, vi } from "vitest";
import type { ReviewEvent } from "./reviewApi.ts";
import {
  addCalendar,
  dismiss,
  execute,
  formatDate,
  getBodyUrl,
  getReview,
} from "./reviewApi.ts";

function mockFetch(status: number, body: unknown): void {
  globalThis.fetch = vi.fn().mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("getReview", () => {
  test("GETs /api/review and returns the items array", async () => {
    mockFetch(200, { ok: true, items: [{ id: "r1" }, { id: "r2" }] });

    const items = await getReview();

    expect(fetch).toHaveBeenCalledWith("/api/review");
    expect(items.map((i) => i.id)).toEqual(["r1", "r2"]);
  });

  test("returns [] when items is absent", async () => {
    mockFetch(200, { ok: true });
    expect(await getReview()).toEqual([]);
  });

  test("throws on unexpected non-2xx", async () => {
    mockFetch(500, { ok: false });
    await expect(getReview()).rejects.toThrow();
  });
});

describe("execute", () => {
  test("POSTs {id,action} to /api/review/execute", async () => {
    mockFetch(200, { ok: true });

    await execute("r1", "archive");

    expect(fetch).toHaveBeenCalledWith("/api/review/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "r1", action: "archive" }),
    });
  });

  test("throws on non-2xx", async () => {
    mockFetch(500, { ok: false });
    await expect(execute("r1", "keep")).rejects.toThrow();
  });
});

describe("addCalendar", () => {
  test("POSTs {id,eventIndex,event} and returns {url}", async () => {
    mockFetch(200, { ok: true, url: "https://cal/xyz" });
    const event: ReviewEvent = {
      title: "Wine dinner",
      date: "2026-07-10",
      time: "18:00",
      location: "Las Vegas",
      description: "RSVP required",
      url: null,
    };

    const result = await addCalendar("r1", 2, event);

    expect(fetch).toHaveBeenCalledWith("/api/review/calendar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "r1", eventIndex: 2, event }),
    });
    expect(result).toEqual({ url: "https://cal/xyz" });
  });
});

describe("dismiss", () => {
  test("POSTs {id} to /api/review/dismiss", async () => {
    mockFetch(200, { ok: true });

    await dismiss("r9");

    expect(fetch).toHaveBeenCalledWith("/api/review/dismiss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "r9" }),
    });
  });
});

describe("getBodyUrl", () => {
  test("returns the /api/preview/:id URL, encoded", () => {
    expect(getBodyUrl("abc 123+def")).toBe("/api/preview/abc%20123%2Bdef");
  });
});

describe("formatDate", () => {
  test("falls back to the raw string when unparseable", () => {
    expect(formatDate("not-a-date")).toBe("not-a-date");
  });

  test("formats a valid date", () => {
    // Locale-dependent, but must not equal the raw ISO string.
    const out = formatDate("2026-07-10T18:00:00Z");
    expect(out).not.toBe("2026-07-10T18:00:00Z");
    expect(out.length).toBeGreaterThan(0);
  });
});

import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { StatsChart } from "../settings/sections/StatsChart.tsx";
import type { StatsDay } from "../settings/settingsApi.ts";

// Fixed "today" so the 30-day window is deterministic.
const TODAY = new Date("2026-08-19T12:00:00Z");

function daysAgo(n: number): string {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function day(date: string, over: Partial<StatsDay> = {}): StatsDay {
  return {
    date,
    kept: 0,
    cleaned: 0,
    junked: 0,
    unsubbed: 0,
    vip: 0,
    ok: 0,
    inboxSize: null,
    ...over,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(TODAY);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("StatsChart", () => {
  test("renders 30 bars, carries in-window fixture values, and drops the out-of-window day", () => {
    const daily: StatsDay[] = [
      // 29 days ago is the oldest day inside the window.
      day(daysAgo(29), {
        kept: 1,
        cleaned: 2,
        junked: 3,
        unsubbed: 4,
        vip: 5,
        ok: 6,
      }), // total 21
      day(daysAgo(10), {
        kept: 2,
        cleaned: 0,
        junked: 1,
        unsubbed: 0,
        vip: 0,
        ok: 0,
      }), // total 3
      day(daysAgo(0), {
        kept: 0,
        cleaned: 0,
        junked: 0,
        unsubbed: 0,
        vip: 7,
        ok: 0,
      }), // total 7
      // 30 days ago is one day OUTSIDE the window (loop only covers i=29..0).
      day(daysAgo(30), {
        kept: 9,
        cleaned: 9,
        junked: 9,
        unsubbed: 9,
        vip: 9,
        ok: 9,
      }),
    ];

    render(<StatsChart daily={daily} />);

    const bars = screen.getAllByTestId("stats-bar");
    expect(bars).toHaveLength(30);

    expect(bars.map((b) => b.getAttribute("data-date"))).not.toContain(
      daysAgo(30),
    );

    const byDate = (date: string) =>
      bars.find((b) => b.getAttribute("data-date") === date)!;
    expect(byDate(daysAgo(29)).getAttribute("data-total")).toBe("21");
    expect(byDate(daysAgo(10)).getAttribute("data-total")).toBe("3");
    expect(byDate(daysAgo(0)).getAttribute("data-total")).toBe("7");

    // Every other in-window day was filled with zeros.
    const zeroFilled = bars.filter(
      (b) =>
        ![daysAgo(29), daysAgo(10), daysAgo(0)].includes(
          b.getAttribute("data-date")!,
        ),
    );
    expect(zeroFilled).toHaveLength(27);
    for (const bar of zeroFilled) {
      expect(bar.getAttribute("data-total")).toBe("0");
    }
  });

  test("renders an explicit empty state when daily is empty", () => {
    render(<StatsChart daily={[]} />);
    expect(screen.queryAllByTestId("stats-bar")).toHaveLength(0);
    expect(screen.getByText(/no activity yet/i)).toBeInTheDocument();
  });

  test("renders an explicit empty state when daily is undefined", () => {
    render(<StatsChart />);
    expect(screen.queryAllByTestId("stats-bar")).toHaveLength(0);
    expect(screen.getByText(/no activity yet/i)).toBeInTheDocument();
  });
});

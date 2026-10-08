import { render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AppShell } from "../shell/AppShell.tsx";

test("shell shows six tabs, Triage current", () => {
  render(
    <MemoryRouter basename="/app" initialEntries={["/app"]}>
      <AppShell />
    </MemoryRouter>,
  );
  ["Triage", "Lists", "Events", "Review", "Settings", "Labeled"].forEach((t) =>
    expect(screen.getByText(t)).toBeInTheDocument(),
  );
  expect(
    screen.getByRole("link", { name: /Triage/ }).getAttribute("aria-current"),
  ).toBe("page");
});

test("shell has a real full-page link out to the legacy UI", () => {
  render(
    <MemoryRouter basename="/app" initialEntries={["/app"]}>
      <AppShell />
    </MemoryRouter>,
  );
  expect(
    screen.getByRole("link", { name: /legacy ui/i }).getAttribute("href"),
  ).toBe("/legacy");
});

afterEach(() => vi.unstubAllGlobals());

test("shell shows which mailbox this instance serves", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: true, email: "robin@strasz.com" })),
    ),
  );
  render(
    <MemoryRouter basename="/app" initialEntries={["/app"]}>
      <AppShell />
    </MemoryRouter>,
  );
  expect(await screen.findByText("robin@strasz.com")).toBeInTheDocument();
  expect(document.title).toContain("robin@strasz.com");
});

test("shell renders without a mailbox label when the lookup fails", async () => {
  const f = vi.fn(async () => new Response("{}", { status: 500 }));
  vi.stubGlobal("fetch", f);
  render(
    <MemoryRouter basename="/app" initialEntries={["/app"]}>
      <AppShell />
    </MemoryRouter>,
  );
  await waitFor(() => expect(f).toHaveBeenCalled());
  expect(screen.queryByText(/@/)).toBeNull();
  expect(screen.getByText("Triage")).toBeInTheDocument();
});

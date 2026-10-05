import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppShell } from "../shell/AppShell.tsx";

function renderShell() {
  render(
    <MemoryRouter basename="/app" initialEntries={["/app"]}>
      <AppShell />
    </MemoryRouter>,
  );
}

test("nav tabs carry the 44px min-height class", () => {
  renderShell();
  expect(screen.getByRole("link", { name: "Triage" }).className).toContain(
    "min-h-11",
  );
  expect(screen.getByRole("link", { name: /legacy ui/i }).className).toContain(
    "min-h-11",
  );
});

test("nav pads its bottom with the safe-area inset", () => {
  renderShell();
  expect(
    screen.getByRole("navigation", { name: "Main navigation" }).className,
  ).toContain("pb-[env(safe-area-inset-bottom)]");
});

test("Legacy link keeps the accessible name Legacy UI", () => {
  renderShell();
  expect(
    screen.getByRole("link", { name: "Legacy UI" }).getAttribute("href"),
  ).toBe("/legacy");
});

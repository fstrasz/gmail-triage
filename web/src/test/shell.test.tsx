import { render, screen } from "@testing-library/react";
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

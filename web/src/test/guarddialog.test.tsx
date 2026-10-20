import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { GuardDialog } from "../triage/GuardDialog.tsx";

function renderGuard(guard: Parameters<typeof GuardDialog>[0]["guard"]) {
  render(<GuardDialog guard={guard} onConfirm={vi.fn()} onCancel={vi.fn()} />);
}

describe("GuardDialog", () => {
  test("delete-all names the sender, count and Trash recovery", () => {
    renderGuard({
      count: 42,
      message: "42 messages.",
      action: "delete-all",
      fromName: "Acme",
    });
    expect(screen.getByText("Delete all mail from Acme?")).toBeTruthy();
    const btn = screen.getByRole("button", { name: "Move 42 to Trash" });
    expect(btn.className).toContain("bg-junk");
    expect(screen.getByText(/recovered for 30 days/)).toBeTruthy();
  });

  test("archive-all uses a non-destructive button and says mail stays", () => {
    renderGuard({
      count: 7,
      message: "7 messages.",
      action: "archive-all",
      fromName: null,
    });
    expect(screen.getByText("Archive all mail from this sender?")).toBeTruthy();
    const btn = screen.getByRole("button", { name: "Archive 7" });
    expect(btn.className).toContain("bg-ink");
    expect(btn.className).not.toContain("bg-junk");
    expect(screen.getByText(/stay in All Mail/)).toBeTruthy();
  });

  test("a guard without an action renders the generic dialog", () => {
    renderGuard({ count: 150, message: "150 messages." });
    expect(screen.getByText("Confirm bulk action")).toBeTruthy();
    const btn = screen.getByRole("button", { name: "Confirm" });
    expect(btn.className).toContain("bg-junk");
  });
});

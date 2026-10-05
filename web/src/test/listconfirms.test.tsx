import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { MergedRow, Rule } from "../lists/listsApi.ts";

const ruleDeleteMutate = vi.fn();

vi.mock("../lists/listsQueries.ts", () => ({
  useAddRule: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateRule: () => ({ mutate: vi.fn(), isPending: false }),
  useToggleRule: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteRule: () => ({ mutate: ruleDeleteMutate, isPending: false }),
}));

import { ListRow } from "../lists/ListRow.tsx";
import { RulesSection } from "../lists/RulesSection.tsx";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("list entry removal confirm", () => {
  const row: MergedRow = {
    email: "ceo@bigco.example",
    fragmented: false,
    memberships: [{ list: "vip", name: "Dana CEO", reason: "", date: "" }],
  };

  test("x opens a named confirmation and does not remove until confirmed", () => {
    const onRemove = vi.fn();
    render(<ListRow row={row} onRemove={onRemove} removing={false} />);

    fireEvent.click(screen.getByRole("button", { name: "Remove Dana CEO from VIP" }));

    expect(screen.getByText("Remove Dana CEO from VIP?")).toBeInTheDocument();
    expect(screen.getByText(/ceo@bigco\.example will no longer be auto-labeled VIP/)).toBeInTheDocument();
    expect(onRemove).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledWith("vip", "ceo@bigco.example", "Dana CEO");
  });
});

describe("rule delete confirm", () => {
  const rule: Rule = {
    id: "r1",
    name: "Receipts",
    senders: [],
    subjects: [],
    label: "Receipts",
    skipInbox: false,
    enabled: true,
    date: "2026-01-01",
  };

  test("Delete opens a named confirmation and does not delete until confirmed", () => {
    render(<RulesSection rules={[rule]} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete Receipts" }));

    expect(screen.getByText("Delete rule “Receipts”?")).toBeInTheDocument();
    expect(ruleDeleteMutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Delete rule" }));
    expect(ruleDeleteMutate).toHaveBeenCalledTimes(1);
    expect(ruleDeleteMutate).toHaveBeenCalledWith({ id: "r1" });
  });
});

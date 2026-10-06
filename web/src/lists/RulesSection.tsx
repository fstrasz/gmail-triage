import { type FormEvent, useState } from "react";
import { ConfirmDialog } from "../settings/ConfirmDialog.tsx";
import { btnPrimary, btnSecondary, input } from "../shell/ui.ts";
import type { Rule } from "./listsApi.ts";
import {
  useAddRule,
  useDeleteRule,
  useToggleRule,
  useUpdateRule,
} from "./listsQueries.ts";

const INPUT = input;

function linesToArray(v: string): string[] {
  return v
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function RulesSection({ rules }: { rules: Rule[] }) {
  const addRule = useAddRule();
  const updateRule = useUpdateRule();
  const toggleRule = useToggleRule();
  const deleteRule = useDeleteRule();

  const [pendingDelete, setPendingDelete] = useState<Rule | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [senders, setSenders] = useState("");
  const [subjects, setSubjects] = useState("");
  const [label, setLabel] = useState("");
  const [skipInbox, setSkipInbox] = useState(false);

  function resetForm() {
    setEditingId(null);
    setName("");
    setSenders("");
    setSubjects("");
    setLabel("");
    setSkipInbox(false);
  }

  function startEdit(r: Rule) {
    setEditingId(r.id);
    setName(r.name ?? "");
    setSenders((r.senders ?? []).join("\n"));
    setSubjects((r.subjects ?? []).join("\n"));
    setLabel(r.label ?? "");
    setSkipInbox(Boolean(r.skipInbox));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const lbl = label.trim();
    if (!lbl) return;
    const payload = {
      name: name.trim() || undefined,
      senders: linesToArray(senders),
      subjects: linesToArray(subjects),
      label: lbl,
      skipInbox,
    };
    if (editingId) {
      updateRule.mutate(
        { id: editingId, ...payload },
        { onSuccess: resetForm },
      );
    } else {
      addRule.mutate(payload, { onSuccess: resetForm });
    }
  }

  const busy = addRule.isPending || updateRule.isPending;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-ink">Rules</h2>

      {rules.length === 0 ? (
        <p className="text-sm text-muted">No rules yet.</p>
      ) : (
        <ul className="divide-y divide-rule overflow-hidden rounded-xl border border-rule bg-paper">
          {rules.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink">
                  {r.name || r.label}
                </p>
                <p className="truncate text-xs text-muted">
                  → {r.label}
                  {r.skipInbox ? " (skip inbox)" : ""}
                  {r.senders?.length ? ` · from: ${r.senders.join(", ")}` : ""}
                  {r.subjects?.length
                    ? ` · subj: ${r.subjects.join(", ")}`
                    : ""}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={r.enabled}
                aria-label={`Toggle ${r.name || r.label}`}
                disabled={toggleRule.isPending}
                onClick={() => toggleRule.mutate({ id: r.id })}
                className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                  r.enabled
                    ? "border-ok bg-ok text-on-fill"
                    : "border-hairline text-muted"
                }`}
              >
                {r.enabled ? "On" : "Off"}
              </button>
              <button
                type="button"
                onClick={() => startEdit(r)}
                className="text-xs font-medium text-ink underline"
              >
                Edit
              </button>
              <button
                type="button"
                aria-label={`Delete ${r.name || r.label}`}
                disabled={deleteRule.isPending}
                onClick={() => setPendingDelete(r)}
                className="text-xs font-medium text-junk underline disabled:opacity-40"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Delete rule “${pendingDelete?.name || pendingDelete?.label}”?`}
        message="The rule stops labeling new mail. Mail it already labeled keeps its label. The rule itself cannot be restored."
        confirmLabel="Delete rule"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) deleteRule.mutate({ id: pendingDelete.id });
          setPendingDelete(null);
        }}
      />

      <form
        onSubmit={submit}
        className="flex flex-col gap-2 rounded-xl border border-rule bg-paper p-3"
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          {editingId ? "Edit rule" : "Add rule"}
        </p>
        <input
          aria-label="Rule name"
          placeholder="Name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={INPUT}
        />
        <textarea
          aria-label="Senders (one per line)"
          placeholder="Senders, one per line"
          value={senders}
          onChange={(e) => setSenders(e.target.value)}
          className={`min-h-16 ${INPUT}`}
        />
        <textarea
          aria-label="Subjects (one per line)"
          placeholder="Subjects, one per line"
          value={subjects}
          onChange={(e) => setSubjects(e.target.value)}
          className={`min-h-16 ${INPUT}`}
        />
        <input
          aria-label="Label"
          placeholder="Label (required)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className={INPUT}
        />
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={skipInbox}
            onChange={(e) => setSkipInbox(e.target.checked)}
          />{" "}
          Skip inbox
        </label>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={!label.trim() || busy}
            className={btnPrimary}
          >
            {editingId ? "Save" : "Add rule"}
          </button>
          {editingId && (
            <button type="button" onClick={resetForm} className={btnSecondary}>
              Cancel
            </button>
          )}
        </div>
      </form>
    </section>
  );
}

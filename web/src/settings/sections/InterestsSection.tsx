import { X } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import { btnPrimary } from "../../shell/ui.ts";
import { Card, inputClass } from "../Card.tsx";
import {
  useAddInterest,
  useEditInterest,
  useRemoveInterest,
} from "../settingsQueries.ts";

export function InterestsSection({ interests }: { interests: string[] }) {
  const add = useAddInterest();
  const remove = useRemoveInterest();
  const edit = useEditInterest();
  const [value, setValue] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  function onAdd(e: FormEvent) {
    e.preventDefault();
    const v = value.trim();
    if (!v) return;
    add.mutate(v);
    setValue("");
  }

  function startEdit(topic: string) {
    setEditing(topic);
    setEditValue(topic);
  }

  function saveEdit(e: FormEvent) {
    e.preventDefault();
    const next = editValue.trim();
    if (editing && next && next !== editing)
      edit.mutate({ old: editing, new: next });
    setEditing(null);
  }

  return (
    <Card title="Event Interests">
      <ul className="mb-3 flex flex-col gap-2">
        {interests.length === 0 && (
          <li className="text-sm text-muted">No interests yet.</li>
        )}
        {interests.map((topic) => (
          <li key={topic} className="flex items-center gap-2 text-sm text-ink">
            {editing === topic ? (
              <form className="flex flex-1 gap-2" onSubmit={saveEdit}>
                <input
                  className={`${inputClass} flex-1`}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  aria-label={`Edit ${topic}`}
                  autoFocus
                />
                <button
                  type="submit"
                  className="text-sm font-semibold text-ink"
                >
                  Save
                </button>
                <button
                  type="button"
                  className="text-sm text-muted"
                  onClick={() => setEditing(null)}
                >
                  Cancel
                </button>
              </form>
            ) : (
              <>
                <span className="flex-1">{topic}</span>
                <button
                  type="button"
                  className="text-muted hover:text-ink"
                  onClick={() => startEdit(topic)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${topic}`}
                  className="inline-flex min-h-6 min-w-6 items-center justify-center rounded-md text-muted hover:bg-junk/10 hover:text-junk pointer-coarse:min-h-11 pointer-coarse:min-w-11"
                  onClick={() => remove.mutate(topic)}
                >
                  <X aria-hidden size={14} strokeWidth={2.25} />
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      <form className="flex gap-2" onSubmit={onAdd}>
        <input
          className={`${inputClass} flex-1`}
          placeholder="Add an interest (e.g. wine dinners)"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="New interest"
        />
        <button type="submit" className={btnPrimary}>
          Add
        </button>
      </form>
    </Card>
  );
}

import type { FormEvent } from "react";
import { useState } from "react";
import { Card, inputClass } from "../Card.tsx";
import { useAddLocation, useRemoveLocation } from "../settingsQueries.ts";

export function LocationsSection({ locations }: { locations: string[] }) {
  const add = useAddLocation();
  const remove = useRemoveLocation();
  const [value, setValue] = useState("");

  function onAdd(e: FormEvent) {
    e.preventDefault();
    const v = value.trim();
    if (!v) return;
    add.mutate(v);
    setValue("");
  }

  return (
    <Card title="Locations">
      <ul className="mb-3 flex flex-wrap gap-2">
        {locations.length === 0 && (
          <li className="text-sm text-muted">No locations yet.</li>
        )}
        {locations.map((loc) => (
          <li
            key={loc}
            className="flex items-center gap-1 rounded-full border border-hairline px-3 py-1 text-sm text-ink"
          >
            <span>{loc}</span>
            <button
              type="button"
              aria-label={`Remove ${loc}`}
              className="text-muted hover:text-junk"
              onClick={() => remove.mutate(loc)}
            >
              &times;
            </button>
          </li>
        ))}
      </ul>
      <form className="flex gap-2" onSubmit={onAdd}>
        <input
          className={`${inputClass} flex-1`}
          placeholder="Add a location (e.g. Las Vegas, NV)"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="New location"
        />
        <button
          type="submit"
          className="rounded-lg bg-ink px-3 py-1.5 text-sm font-semibold text-white"
        >
          Add
        </button>
      </form>
    </Card>
  );
}

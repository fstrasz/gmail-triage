import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { Card, numberInputClass, saveBtnClass } from "../Card.tsx";
import { useSetBulkGuardThreshold } from "../settingsQueries.ts";

const DEFAULT_THRESHOLD = 100;

export function BulkGuardSection({ threshold }: { threshold: number }) {
  const save = useSetBulkGuardThreshold();
  // Blank means "revert to default". Seed from the effective server value.
  const [value, setValue] = useState(String(threshold));

  useEffect(() => {
    setValue(String(threshold));
  }, [threshold]);

  function onSave(e: FormEvent) {
    e.preventDefault();
    // Blank/0/negative → send 0, which the server treats as "clear to default".
    // Clamp negatives to 0 so a typed "-5" doesn't silently pass through as-is.
    const raw = value.trim() === "" ? 0 : Number(value);
    save.mutate(Number.isFinite(raw) ? Math.max(0, raw) : 0);
  }

  return (
    <Card title="Bulk-Guard Threshold">
      <p className="mb-2 text-sm text-muted">
        Confirmation is required for a bulk action affecting more than this many
        emails. Current effective value:{" "}
        <span className="font-semibold text-ink">{threshold}</span>. Leave blank
        or 0 to use the default ({DEFAULT_THRESHOLD}).
      </p>
      <form className="flex items-center gap-2" onSubmit={onSave}>
        <input
          type="number"
          min={0}
          className={numberInputClass}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="Bulk-guard threshold"
        />
        <button
          type="submit"
          className={`${saveBtnClass} mt-0`}
          disabled={save.isPending}
        >
          Save
        </button>
      </form>
    </Card>
  );
}

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { Card, Field, numberInputClass, saveBtnClass } from "../Card.tsx";
import type { Settings } from "../settingsApi.ts";
import { useRunScan, useSetScheduler } from "../settingsQueries.ts";

export function SchedulerSection({ settings }: { settings: Settings }) {
  const save = useSetScheduler();
  const runScan = useRunScan();
  const [enabled, setEnabled] = useState(settings.schedulerEnabled);
  const [startHour, setStartHour] = useState(settings.schedulerStartHour);
  const [startMinute, setStartMinute] = useState(settings.schedulerStartMinute);
  const [intervalHours, setIntervalHours] = useState(
    settings.schedulerIntervalHours,
  );

  useEffect(() => {
    setEnabled(settings.schedulerEnabled);
    setStartHour(settings.schedulerStartHour);
    setStartMinute(settings.schedulerStartMinute);
    setIntervalHours(settings.schedulerIntervalHours);
  }, [
    settings.schedulerEnabled,
    settings.schedulerStartHour,
    settings.schedulerStartMinute,
    settings.schedulerIntervalHours,
  ]);

  function onSave(e: FormEvent) {
    e.preventDefault();
    save.mutate({ enabled, startHour, startMinute, intervalHours });
  }

  const scan = runScan.data;

  return (
    <Card title="Auto-Clean Scheduler">
      <form onSubmit={onSave}>
        <Field label="Enabled">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
        </Field>
        <Field label="Start hour (0-23)">
          <input
            type="number"
            min={0}
            max={23}
            className={numberInputClass}
            value={startHour}
            onChange={(e) => setStartHour(Number(e.target.value))}
          />
        </Field>
        <Field label="Start minute (0-59)">
          <input
            type="number"
            min={0}
            max={59}
            className={numberInputClass}
            value={startMinute}
            onChange={(e) => setStartMinute(Number(e.target.value))}
          />
        </Field>
        <Field label="Interval (hours)">
          <input
            type="number"
            min={0.5}
            step={0.5}
            className={numberInputClass}
            value={intervalHours}
            onChange={(e) => setIntervalHours(Number(e.target.value))}
          />
        </Field>
        <button
          type="submit"
          className={saveBtnClass}
          disabled={save.isPending}
        >
          Save
        </button>
      </form>

      <div className="mt-4 border-t border-hairline pt-3">
        <button
          type="button"
          className="rounded-lg border border-ink px-3 py-1.5 text-sm font-semibold text-ink disabled:opacity-40"
          disabled={runScan.isPending}
          onClick={() => runScan.mutate()}
        >
          {runScan.isPending ? "Running…" : "Run Auto-Clean Now"}
        </button>
        {scan?.ok && (
          <p className="mt-2 text-sm text-muted" role="status">
            Moved {scan.totalMoved} ({scan.blocklistMoved} block /{" "}
            {scan.vipMoved} VIP / {scan.okMoved} OK / {scan.rulesMoved} rules)
            at {scan.timeLabel}.
          </p>
        )}
        {scan && !scan.ok && (
          <p className="mt-2 text-sm text-junk" role="status">
            Gmail connection expired.{" "}
            <a href="/auth" className="font-semibold underline">
              Reconnect
            </a>
            .
          </p>
        )}
      </div>
    </Card>
  );
}

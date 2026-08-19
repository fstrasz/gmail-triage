import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import {
  Card,
  Field,
  inputClass,
  numberInputClass,
  saveBtnClass,
} from "../Card.tsx";
import type { Settings } from "../settingsApi.ts";
import {
  useSetDailySummary,
  useSetDailySummarySchedule,
} from "../settingsQueries.ts";

const UNITS: Settings["dailySummaryIntervalUnit"][] = [
  "hours",
  "days",
  "weeks",
];

export function DailySummarySection({ settings }: { settings: Settings }) {
  const saveSummary = useSetDailySummary();
  const saveSchedule = useSetDailySummarySchedule();

  const [enabled, setEnabled] = useState(settings.dailySummaryEnabled);
  const [email, setEmail] = useState(settings.dailySummaryEmail);
  const [hour, setHour] = useState(settings.dailySummaryHour);
  const [minute, setMinute] = useState(settings.dailySummaryMinute);
  const [intervalValue, setIntervalValue] = useState(
    settings.dailySummaryIntervalValue,
  );
  const [intervalUnit, setIntervalUnit] = useState(
    settings.dailySummaryIntervalUnit,
  );

  useEffect(() => {
    setEnabled(settings.dailySummaryEnabled);
    setEmail(settings.dailySummaryEmail);
  }, [settings.dailySummaryEnabled, settings.dailySummaryEmail]);

  useEffect(() => {
    setHour(settings.dailySummaryHour);
    setMinute(settings.dailySummaryMinute);
    setIntervalValue(settings.dailySummaryIntervalValue);
    setIntervalUnit(settings.dailySummaryIntervalUnit);
  }, [
    settings.dailySummaryHour,
    settings.dailySummaryMinute,
    settings.dailySummaryIntervalValue,
    settings.dailySummaryIntervalUnit,
  ]);

  function onSaveSummary(e: FormEvent) {
    e.preventDefault();
    saveSummary.mutate({ enabled, email });
  }

  function onSaveSchedule(e: FormEvent) {
    e.preventDefault();
    saveSchedule.mutate({ hour, minute, intervalValue, intervalUnit });
  }

  return (
    <Card title="Daily Summary">
      <form onSubmit={onSaveSummary}>
        <Field label="Enabled">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
        </Field>
        <Field label="Email">
          <input
            type="email"
            className={`${inputClass} w-56`}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="recipient@example.com"
          />
        </Field>
        <button
          type="submit"
          className={saveBtnClass}
          disabled={saveSummary.isPending}
        >
          Save summary
        </button>
      </form>

      <form
        className="mt-4 border-t border-hairline pt-3"
        onSubmit={onSaveSchedule}
      >
        <Field label="Hour (0-23)">
          <input
            type="number"
            min={0}
            max={23}
            className={numberInputClass}
            value={hour}
            onChange={(e) => setHour(Number(e.target.value))}
          />
        </Field>
        <Field label="Minute (0-59)">
          <input
            type="number"
            min={0}
            max={59}
            className={numberInputClass}
            value={minute}
            onChange={(e) => setMinute(Number(e.target.value))}
          />
        </Field>
        <Field label="Every">
          <span className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              className={numberInputClass}
              value={intervalValue}
              onChange={(e) => setIntervalValue(Number(e.target.value))}
            />
            <select
              className={inputClass}
              value={intervalUnit}
              onChange={(e) =>
                setIntervalUnit(
                  e.target.value as Settings["dailySummaryIntervalUnit"],
                )
              }
              aria-label="Interval unit"
            >
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </span>
        </Field>
        <button
          type="submit"
          className={saveBtnClass}
          disabled={saveSchedule.isPending}
        >
          Save schedule
        </button>
      </form>
    </Card>
  );
}

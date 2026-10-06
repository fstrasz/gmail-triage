import { useState } from "react";
import { loadTheme, saveTheme, type ThemePref } from "../../lib/theme.ts";
import { Card, Field, inputClass } from "../Card.tsx";
import type { Settings } from "../settingsApi.ts";
import { useSetListsViewMode } from "../settingsQueries.ts";

const THEMES: { value: ThemePref; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function DisplaySection({ mode }: { mode: Settings["listsViewMode"] }) {
  const setMode = useSetListsViewMode();
  // Per device, not per account: a phone in low light and a desk monitor can
  // want different themes. Stored in localStorage, never sent to the server.
  const [theme, setTheme] = useState<ThemePref>(loadTheme);

  return (
    <Card title="Display">
      <div className="flex items-center justify-between gap-3 py-1 text-sm text-ink">
        <span id="theme-label">Theme (this device)</span>
        <fieldset
          aria-labelledby="theme-label"
          className="inline-flex rounded-lg border border-rule-strong bg-sunk p-0.5"
        >
          {THEMES.map((t) => (
            <label
              key={t.value}
              className="cursor-pointer rounded-md px-2.5 py-1 text-xs font-semibold text-muted transition-colors duration-150 hover:text-ink has-checked:bg-paper has-checked:text-ink has-checked:ring-1 has-checked:ring-rule-strong has-focus-visible:outline-2 has-focus-visible:outline-ink pointer-coarse:px-3.5 pointer-coarse:py-2.5"
            >
              <input
                type="radio"
                name="theme"
                value={t.value}
                checked={theme === t.value}
                onChange={() => {
                  setTheme(t.value);
                  saveTheme(t.value);
                }}
                className="sr-only"
              />
              {t.label}
            </label>
          ))}
        </fieldset>
      </div>
      <Field label="Legacy UI lists view">
        <select
          className={inputClass}
          value={mode}
          onChange={(e) =>
            setMode.mutate(e.target.value as Settings["listsViewMode"])
          }
          aria-label="Lists view mode"
        >
          <option value="table">Table</option>
          <option value="compact">Compact</option>
        </select>
      </Field>
    </Card>
  );
}

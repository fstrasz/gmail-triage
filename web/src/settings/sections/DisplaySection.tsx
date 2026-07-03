import { Card, Field, inputClass } from '../Card.tsx'
import { useSetListsViewMode } from '../settingsQueries.ts'
import type { Settings } from '../settingsApi.ts'

export function DisplaySection({ mode }: { mode: Settings['listsViewMode'] }) {
  const setMode = useSetListsViewMode()

  return (
    <Card title="Display">
      <Field label="Lists view mode">
        <select
          className={inputClass}
          value={mode}
          onChange={(e) => setMode.mutate(e.target.value as Settings['listsViewMode'])}
          aria-label="Lists view mode"
        >
          <option value="table">Table</option>
          <option value="compact">Compact</option>
        </select>
      </Field>
    </Card>
  )
}

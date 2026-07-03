import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Card, Field, numberInputClass, inputClass, saveBtnClass } from '../Card.tsx'
import { useSetEventsSearch } from '../settingsQueries.ts'
import type { Settings } from '../settingsApi.ts'

export function EventSearchSection({ settings }: { settings: Settings }) {
  const save = useSetEventsSearch()
  const [enabled, setEnabled] = useState(settings.eventsSearchEnabled)
  const [intervalDays, setIntervalDays] = useState(settings.eventsSearchIntervalDays)
  const [email, setEmail] = useState(settings.eventsSearchEmail ?? '')

  // Re-sync when the server values change (e.g. after another save).
  useEffect(() => {
    setEnabled(settings.eventsSearchEnabled)
    setIntervalDays(settings.eventsSearchIntervalDays)
    setEmail(settings.eventsSearchEmail ?? '')
  }, [settings.eventsSearchEnabled, settings.eventsSearchIntervalDays, settings.eventsSearchEmail])

  function onSave(e: FormEvent) {
    e.preventDefault()
    save.mutate({ enabled, intervalDays, email })
  }

  return (
    <Card title="Event Search">
      <form onSubmit={onSave}>
        <Field label="Enabled">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        </Field>
        <Field label="Interval (days)">
          <input
            type="number"
            min={1}
            className={numberInputClass}
            value={intervalDays}
            onChange={(e) => setIntervalDays(Number(e.target.value))}
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
        <button type="submit" className={saveBtnClass} disabled={save.isPending}>
          Save
        </button>
      </form>
    </Card>
  )
}

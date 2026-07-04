import { Card, Field, inputClass } from '../Card.tsx'
import { useSetTimezone } from '../settingsQueries.ts'

// Common US zones + UTC. The current value is appended if it's not in the list
// so the select always shows the active timezone.
const TIMEZONES = [
  'America/Los_Angeles',
  'America/Denver',
  'America/Phoenix',
  'America/Chicago',
  'America/New_York',
  'America/Anchorage',
  'Pacific/Honolulu',
  'UTC',
]

export function TimezoneSection({ timezone }: { timezone: string }) {
  const setTz = useSetTimezone()
  const options = TIMEZONES.includes(timezone) ? TIMEZONES : [timezone, ...TIMEZONES]

  return (
    <Card title="Timezone">
      <Field label="Timezone">
        <select
          className={inputClass}
          value={timezone}
          onChange={(e) => setTz.mutate(e.target.value)}
          aria-label="Timezone"
        >
          {options.map((tz) => (
            <option key={tz} value={tz}>{tz}</option>
          ))}
        </select>
      </Field>
    </Card>
  )
}

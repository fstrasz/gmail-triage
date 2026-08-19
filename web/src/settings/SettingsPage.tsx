import { useSettings } from './settingsQueries.ts'
import { LocationsSection } from './sections/LocationsSection.tsx'
import { InterestsSection } from './sections/InterestsSection.tsx'
import { EventSearchSection } from './sections/EventSearchSection.tsx'
import { SchedulerSection } from './sections/SchedulerSection.tsx'
import { DailySummarySection } from './sections/DailySummarySection.tsx'
import { DisplaySection } from './sections/DisplaySection.tsx'
import { TimezoneSection } from './sections/TimezoneSection.tsx'
import { BulkGuardSection } from './sections/BulkGuardSection.tsx'
import { BackupsSection } from './sections/BackupsSection.tsx'
import { ActivityLogSection } from './sections/ActivityLogSection.tsx'
import { StatsCard } from './sections/StatsCard.tsx'
import { StatsChart } from './sections/StatsChart.tsx'

export function SettingsPage() {
  const settings = useSettings()

  // Branch order mirrors Slice 1: isError → isPending (skeleton) → data.
  // (No empty state — settings always exist.)
  if (settings.isError) {
    return <ErrorState />
  }

  if (settings.isPending) {
    return <SettingsSkeleton />
  }

  const { settings: s, activityLog, backups, stats, bulkGuardThreshold } = settings.data

  return (
    <div className="h-full overflow-y-auto p-4">
      <h1 className="mb-4 text-lg font-semibold text-ink">Settings</h1>
      <div className="mx-auto grid max-w-4xl grid-cols-1 gap-4 lg:grid-cols-2">
        <LocationsSection locations={s.locations} />
        <InterestsSection interests={s.eventInterests} />
        <EventSearchSection settings={s} />
        <SchedulerSection settings={s} />
        <DailySummarySection settings={s} />
        <TimezoneSection timezone={s.timezone} />
        <DisplaySection mode={s.listsViewMode} />
        <BulkGuardSection threshold={bulkGuardThreshold} />
        <BackupsSection backups={backups} />
        <StatsCard stats={stats} />
        <StatsChart daily={stats.daily} />
        <div className="lg:col-span-2">
          <ActivityLogSection entries={activityLog} />
        </div>
      </div>
    </div>
  )
}

function SettingsSkeleton() {
  return (
    <div data-testid="settings-skeleton" className="grid max-w-4xl grid-cols-1 gap-4 p-4 lg:grid-cols-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-40 animate-pulse rounded-2xl border border-hairline bg-hairline/40" />
      ))}
    </div>
  )
}

function ErrorState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
      <p className="text-lg font-semibold text-ink">Couldn’t load settings</p>
      <p className="text-sm text-muted">
        The server didn’t respond. If the Gmail connection expired, re-authorize to continue.
      </p>
      <a href="/auth" className="rounded-xl bg-ink px-4 py-2 font-semibold text-white">
        Reconnect
      </a>
    </div>
  )
}

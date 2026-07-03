// ---------------------------------------------------------------------------
// Settings feature — typed fetch functions for GET /api/settings + every setter.
// Mirrors web/src/lib/api.ts conventions: relative /api/* URLs, res.json(),
// resolve ok:false/auth as DATA (only run-scan can 503), throw only on
// unexpected non-2xx.
// ---------------------------------------------------------------------------

export interface Settings {
  locations: string[]
  timezone: string
  schedulerEnabled: boolean
  schedulerStartHour: number
  schedulerStartMinute: number
  schedulerIntervalHours: number
  dailySummaryEnabled: boolean
  dailySummaryEmail: string
  dailySummaryHour: number
  dailySummaryMinute: number
  dailySummaryIntervalUnit: 'hours' | 'days' | 'weeks'
  dailySummaryIntervalValue: number
  dailySummaryLastSentAt: string | null
  listsViewMode: 'table' | 'compact'
  eventInterests: string[]
  eventsSearchEnabled: boolean
  eventsSearchEmail: string | null
  eventsSearchIntervalDays: number
  eventsSearchLastRunAt: string | null
  schedulerLastRunAt: string | null
  bulkGuardThreshold?: number
}

export interface ActivityEntry {
  ts: string
  type: 'triage' | 'rule'
  action?: string
  sender?: string
  senderName?: string | null
  count?: number
  msgId?: string
  ruleName?: string
  label?: string
  unsubResult?: string
}

export interface Stats {
  kept: number
  cleaned: number
  junked: number
  unsubbed: number
  vip: number
  ok: number
}

export interface BackupMeta {
  backedUpAt: string
  count: number
}

export interface NamedBackupMeta extends BackupMeta {
  n: number
}

export interface Backups {
  single: BackupMeta | null
  named: NamedBackupMeta[]
}

export interface SettingsResponse {
  ok: true
  settings: Settings
  activityLog: ActivityEntry[]
  backups: Backups
  stats: Stats
  bulkGuardThreshold: number
}

/** Result of the (Gmail-touching, may-503) manual scan. */
export type ScanResult =
  | {
      ok: true
      totalMoved: number
      blocklistMoved: number
      vipMoved: number
      okMoved: number
      rulesMoved: number
      timeLabel: string
    }
  | { ok: false; error: 'gmail_auth' }

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`)
  return res.json() as Promise<T>
}

async function postJson<T = { ok: true }>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  if (!res.ok) throw new Error(`POST ${url} failed: ${res.status}`)
  return res.json() as Promise<T>
}

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

export function getSettings(): Promise<SettingsResponse> {
  return getJson<SettingsResponse>('/api/settings')
}

// ---------------------------------------------------------------------------
// Setters — each thin wrapper over a grouped endpoint
// ---------------------------------------------------------------------------

export interface SchedulerInput {
  enabled: boolean
  startHour: number
  startMinute: number
  intervalHours: number
}
export function setScheduler(v: SchedulerInput): Promise<{ ok: true }> {
  return postJson('/api/settings/scheduler', v)
}

export interface DailySummaryInput {
  enabled: boolean
  email: string
}
export function setDailySummary(v: DailySummaryInput): Promise<{ ok: true }> {
  return postJson('/api/settings/daily-summary', v)
}

export interface DailySummaryScheduleInput {
  hour: number
  minute: number
  intervalValue: number
  intervalUnit: 'hours' | 'days' | 'weeks'
}
export function setDailySummarySchedule(v: DailySummaryScheduleInput): Promise<{ ok: true }> {
  return postJson('/api/settings/daily-summary-schedule', v)
}

export interface EventsSearchInput {
  enabled: boolean
  intervalDays: number
  email: string
}
export function setEventsSearch(v: EventsSearchInput): Promise<{ ok: true }> {
  return postJson('/api/settings/events-search', v)
}

export function setTimezone(timezone: string): Promise<{ ok: true }> {
  return postJson('/api/settings/timezone', { timezone })
}

export function setListsViewMode(mode: 'table' | 'compact'): Promise<{ ok: true }> {
  return postJson('/api/settings/lists-view-mode', { mode })
}

export function setBulkGuardThreshold(threshold: number): Promise<{ ok: true; threshold: number }> {
  return postJson<{ ok: true; threshold: number }>('/api/settings/bulk-guard-threshold', { threshold })
}

export function addLocation(location: string): Promise<{ ok: true }> {
  return postJson('/api/settings/locations/add', { location })
}
export function removeLocation(location: string): Promise<{ ok: true }> {
  return postJson('/api/settings/locations/remove', { location })
}

export function addEventInterest(topic: string): Promise<{ ok: true }> {
  return postJson('/api/settings/event-interests/add', { topic })
}
export function removeEventInterest(topic: string): Promise<{ ok: true }> {
  return postJson('/api/settings/event-interests/remove', { topic })
}
export function editEventInterest(v: { old: string; new: string }): Promise<{ ok: true }> {
  return postJson('/api/settings/event-interests/edit', v)
}

/** Manual auto-clean scan. May 503 with gmail_auth — resolved as data, not thrown. */
export async function runScan(): Promise<ScanResult> {
  const res = await fetch('/api/settings/run-scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  })
  if (res.status === 503) {
    const body = (await res.json()) as { error?: string }
    if (body.error === 'gmail_auth') return { ok: false, error: 'gmail_auth' }
  }
  if (!res.ok) throw new Error(`runScan failed: ${res.status}`)
  return res.json() as Promise<ScanResult>
}

export function restoreBlocklistBackup(merge: boolean): Promise<{ ok: true; restored?: number }> {
  return postJson('/api/settings/restore-blocklist-backup', { merge })
}
export function restoreNamedBackup(v: { n: number; merge: boolean }): Promise<{ ok: true; restored?: number }> {
  return postJson('/api/settings/restore-named-backup', v)
}
export function deleteNamedBackup(n: number): Promise<{ ok: true }> {
  return postJson('/api/settings/delete-named-backup', { n })
}

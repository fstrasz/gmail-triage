import type { Mode } from '../triage/swipeMap.ts'

// Persist the triage "Hide VIP/OK" toggle across visits (future-release #28).
// localStorage is the right home for a per-device UI preference in the SPA (the
// original "settings.json flag" framing predated the React migration; the old
// server-rendered UI is being retired). Guarded so a throwing/absent localStorage
// (private mode, SSR) falls back to the default 'hidden' (filter ON).
const KEY = 'triageMode'

export function loadMode(): Mode {
  try {
    return localStorage.getItem(KEY) === 'shown' ? 'shown' : 'hidden'
  } catch {
    return 'hidden'
  }
}

export function saveMode(mode: Mode): void {
  try {
    localStorage.setItem(KEY, mode)
  } catch {
    /* ignore — private mode / no storage */
  }
}

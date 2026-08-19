import { Routes, Route } from 'react-router-dom'
import { AppShell } from './shell/AppShell.tsx'
import { TriagePage } from './triage/TriagePage.tsx'
import { ListsPage } from './lists/ListsPage.tsx'
import { EventsPage } from './events/EventsPage.tsx'
import { ReviewPage } from './review/ReviewPage.tsx'
import { SettingsPage } from './settings/SettingsPage.tsx'
import { LabeledPage } from './labeled/LabeledPage.tsx'

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<TriagePage />} />
        <Route path="lists" element={<ListsPage />} />
        <Route path="events" element={<EventsPage />} />
        <Route path="review" element={<ReviewPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="labeled" element={<LabeledPage />} />
      </Route>
    </Routes>
  )
}

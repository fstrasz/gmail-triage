import { Routes, Route } from 'react-router-dom'
import { AppShell } from './shell/AppShell.tsx'

function ComingSoon({ name }: { name: string }) {
  return <div>Coming soon — {name}</div>
}

function TriagePage() {
  return <div>Triage</div>
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<TriagePage />} />
        <Route path="lists" element={<ComingSoon name="Lists" />} />
        <Route path="events" element={<ComingSoon name="Events" />} />
        <Route path="review" element={<ComingSoon name="Review" />} />
        <Route path="settings" element={<ComingSoon name="Settings" />} />
      </Route>
    </Routes>
  )
}

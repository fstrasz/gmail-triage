import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { AppShell } from "./shell/AppShell.tsx";
import { TriagePage } from "./triage/TriagePage.tsx";

// Triage is the landing screen and stays in the main bundle; the rest load on
// first visit (and are precached by the service worker for offline launches).
const ListsPage = lazy(() =>
  import("./lists/ListsPage.tsx").then((m) => ({ default: m.ListsPage })),
);
const EventsPage = lazy(() =>
  import("./events/EventsPage.tsx").then((m) => ({ default: m.EventsPage })),
);
const ReviewPage = lazy(() =>
  import("./review/ReviewPage.tsx").then((m) => ({ default: m.ReviewPage })),
);
const SettingsPage = lazy(() =>
  import("./settings/SettingsPage.tsx").then((m) => ({
    default: m.SettingsPage,
  })),
);
const LabeledPage = lazy(() =>
  import("./labeled/LabeledPage.tsx").then((m) => ({ default: m.LabeledPage })),
);

function Lazy({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={null}>{children}</Suspense>;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<TriagePage />} />
        <Route
          path="lists"
          element={
            <Lazy>
              <ListsPage />
            </Lazy>
          }
        />
        <Route
          path="events"
          element={
            <Lazy>
              <EventsPage />
            </Lazy>
          }
        />
        <Route
          path="review"
          element={
            <Lazy>
              <ReviewPage />
            </Lazy>
          }
        />
        <Route
          path="settings"
          element={
            <Lazy>
              <SettingsPage />
            </Lazy>
          }
        />
        <Route
          path="labeled"
          element={
            <Lazy>
              <LabeledPage />
            </Lazy>
          }
        />
      </Route>
    </Routes>
  );
}

import { NavLink, Outlet } from "react-router-dom";

const TABS = [
  { to: "/", label: "Triage", end: true },
  { to: "/lists", label: "Lists", end: false },
  { to: "/events", label: "Events", end: false },
  { to: "/review", label: "Review", end: false },
  { to: "/settings", label: "Settings", end: false },
  { to: "/labeled", label: "Labeled", end: false },
] as const;

export function AppShell() {
  return (
    /**
     * Layout:
     *   ≤768px  — column flex: main content top, tab bar at bottom
     *   >768px  — row flex: narrow nav rail on the left, content fills right
     */
    <div className="flex flex-col h-dvh md:flex-row">
      <main className="flex-1 overflow-y-auto pt-[env(safe-area-inset-top)] md:pt-0 md:order-2">
        <Outlet />
      </main>

      {/*
       * Single nav element, styled as bottom tab bar on small screens
       * and as a left nav rail on medium+ screens.
       * One DOM element — no duplicate link text for screen readers or tests.
       */}
      <nav
        aria-label="Main navigation"
        className="flex border-t border-hairline pb-[env(safe-area-inset-bottom)] md:pb-0 md:border-t-0 md:border-r md:flex-col md:w-16 md:py-4 md:gap-1 md:order-1"
      >
        {TABS.map(({ to, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              [
                "flex-1 flex flex-col items-center justify-center min-h-11 py-2 text-xs",
                "md:flex-none md:min-h-0 md:py-3 md:px-2 md:rounded-lg md:mx-1",
                isActive
                  ? "text-ink font-semibold"
                  : "text-muted hover:text-ink",
              ].join(" ")
            }
          >
            {label}
          </NavLink>
        ))}

        {/*
         * Deliberately a plain full-page anchor, not a NavLink/route: it
         * leaves the SPA on purpose. Several capabilities still only exist
         * in the old server-rendered UI and need to stay discoverable from
         * inside the app.
         */}
        <a
          href="/legacy"
          aria-label="Legacy UI"
          title="Legacy UI"
          className="flex-1 flex items-center justify-center min-h-11 py-2 text-xs text-muted hover:text-ink md:flex-none md:min-h-0 md:py-3"
        >
          Legacy
        </a>
      </nav>
    </div>
  );
}

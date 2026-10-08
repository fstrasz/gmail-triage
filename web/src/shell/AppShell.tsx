import {
  CalendarDays,
  History,
  Inbox,
  ListChecks,
  type LucideIcon,
  ScanSearch,
  Settings,
  Tags,
} from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { MailboxLabel } from "./MailboxLabel.tsx";

const TABS: { to: string; label: string; end: boolean; icon: LucideIcon }[] = [
  { to: "/", label: "Triage", end: true, icon: Inbox },
  { to: "/lists", label: "Lists", end: false, icon: ListChecks },
  { to: "/events", label: "Events", end: false, icon: CalendarDays },
  { to: "/review", label: "Review", end: false, icon: ScanSearch },
  { to: "/settings", label: "Settings", end: false, icon: Settings },
  { to: "/labeled", label: "Labeled", end: false, icon: Tags },
];

// Shared tab geometry. Phone: a bottom bar; md+: a left rail. The active tab
// is cut from the cover in the desk's colour so it reads as an index tab
// opening onto the page (bottom bar: tab hangs down from the page; rail: tab
// reaches right into it).
const TAB =
  "flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[0.6875rem] font-semibold tracking-wide transition-colors duration-150 md:mx-0 md:ml-2 md:min-h-14 md:flex-none md:rounded-l-xl md:py-2";

export function AppShell() {
  return (
    /**
     * Layout:
     *   <768px — column flex: content on top, tab bar at the bottom; the
     *            top safe-area inset shows the cover, so iOS's white status
     *            text stays legible in both themes.
     *   ≥768px — row flex: the cover as a rail on the left, content right.
     */
    <div className="flex h-dvh flex-col bg-board md:flex-row">
      <main className="mt-[env(safe-area-inset-top)] flex-1 overflow-y-auto rounded-b-2xl bg-desk text-ink md:order-2 md:mt-0 md:rounded-b-none md:rounded-l-2xl">
        <MailboxLabel />
        <Outlet />
      </main>

      {/*
       * Single nav element, styled as bottom tab bar on small screens
       * and as a left nav rail on medium+ screens.
       * One DOM element — no duplicate link text for screen readers or tests.
       */}
      <nav
        aria-label="Main navigation"
        className="flex px-1 pb-[env(safe-area-inset-bottom)] md:order-1 md:w-[4.75rem] md:flex-col md:gap-1 md:px-0 md:pb-3 md:pt-3"
      >
        {TABS.map(({ to, label, end, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              [
                TAB,
                isActive
                  ? "-mt-px rounded-b-xl bg-desk text-ink md:mt-0 md:rounded-b-none"
                  : "text-board-ink hover:text-on-fill dark:hover:text-ink",
              ].join(" ")
            }
          >
            <Icon aria-hidden size={20} strokeWidth={1.75} />
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
          className={`${TAB.replace(/^flex /, "")} hidden text-board-ink/80 hover:text-on-fill md:mt-auto md:flex dark:hover:text-ink`}
        >
          <History aria-hidden size={20} strokeWidth={1.75} />
          Legacy
        </a>
      </nav>
    </div>
  );
}

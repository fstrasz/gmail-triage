# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One operator, the owner of the mailbox. He uses it in two situations:

1. **Desktop, at the workstation.** Focused triage sessions in the four-pane deck, mostly driven
   from the keyboard.
2. **iPhone, installed as a PWA.** Quick passes on the go, usually one-handed, using the swipe deck.

There are no other users and no sign-up, sharing, or multi-tenant use.

## Product Purpose

Gmail Triage keeps a busy inbox manageable. It sorts senders into curated lists: VIP, OK, and
Blocklist, which Gmail labels as `..VIP`, `..OK`, and `.DelPend`. A scheduler re-applies those
lists unattended. Claude and a local model help only where a decision is ambiguous.

**Success means:**

1. Daily inbox work takes a few minutes.
2. Nothing important is missed.

When those two conflict, not missing anything wins. Throughput never comes at the cost of losing
an important email.

## Positioning

It is a self-hosted tool built around one person's own sender lists, not a general mail client.
It acts on Gmail through labels and never deletes destructively. Bulk removal goes to Trash, which
gives 30 days to recover. Anything the automation cannot decide confidently is left visible, never
quietly dismissed.

## Operating Context

1. **Hosting.** It runs in Docker on the owner's NAS and is reached on the home network or over
   Tailscale.
2. **Interfaces.** The React app is at `/app`; `/` redirects there. The older server-rendered UI
   stays reachable at `/legacy` for six capabilities not yet ported.
3. **Screens:**
   1. **Triage:** one card at a time; swipe deck on mobile, queue plus detail on desktop.
   2. **Lists:** VIP, OK, Blocklist, and Rules.
   3. **Events:** upcoming events found in mail and on the web.
   4. **Review:** Claude-analysed emails.
   5. **Settings:** scheduler, summaries, thresholds, and a 30-day stats chart.
   6. **Labeled:** browse mail by tier label.
4. **Background work** happens with nobody watching: scheduled scans, read/unread triage, and
   event search. The UI is where the owner supervises it and corrects it.

## Capabilities and Constraints

1. **Triage actions:** VIP, OK, OK & Clean, VIP & Clean, Junk, Unsubscribe, Archive, Delete, and
   Review.
   1. Undo is supported where the action can honestly be reversed.
   2. Bulk archives cannot be fully undone, and the UI says so.
2. **Bulk guard.** Any UI action that would touch more than a live-tunable threshold (default 100)
   must be confirmed, and the dialog shows exactly what it will reach. Automated runs never ask.
3. **Destructive actions** reach exactly as far as their name says, and their scope is visible
   before the click.
4. **Lists govern future mail.** Current inbox state can be cleaned independently of them.
5. **Terminology** used in the UI and code: VIP, OK, Blocklist, DelPend, Clean, Reapply, Review,
   Fragmented (an address stored under three or more display names).
6. **Stack** (existing): React 19, TypeScript, Vite, Tailwind v4, TanStack Query, and Radix, on an
   Express backend. Colour tokens live in `web/src/shell/tokens.css`.
7. **Open decision:** a dark theme is required (see Accessibility) but does not exist yet.

## Brand Commitments

1. **Name:** "Gmail Triage".
2. **Palette:** the app does **not** use the Strasz Assessment Systems brand palette. This is the
   owner's decision, made 2026-10-05. The app keeps its own palette, and colour is chosen for this
   app on its own merits.
3. **Action colours** carry meaning and must stay distinct from each other: VIP, OK, Junk, Review.

## Evidence on Hand

1. **Live usage.** Read-triage reviewed 1,339 real messages and took the unread backlog from 1,334
   to 1.
2. **Daily volume** is about 32 messages per day after the backlog drain.
3. **There are no testimonials, customers, or external users.** None should ever be implied.

## Product Principles

1. **Never lose anything important.**
   1. When a decision is uncertain, the mail stays visible and unread.
   2. Removal goes to Trash and is recoverable.
2. **Fast for the common case, guarded for the rare big one.** Single actions are instant and
   optimistic. Large or destructive ones are confirmed, with their scope shown.
3. **Every action is reachable without gestures.** Swipes and shortcuts speed things up; labeled
   controls remain the guaranteed path.
4. **Be honest about state.** The UI never shows an undo, a count, or a status the system cannot
   back.
5. **Supervision over spectacle.** The UI exists so one person can check and correct the
   automation quickly, not to entertain.

## Accessibility & Inclusion

1. **Keyboard-first on desktop.** Every triage action is reachable and fast from the keyboard,
   with visible focus.
2. **One-handed on iPhone.** Primary controls sit within thumb reach, and the swipe deck works with
   one hand.
3. **Dark mode is required.** It is used in low light, so it is a supported theme rather than an
   optional extra. It is not implemented yet.
4. **Not gesture-only.** Every gesture has a labeled-control equivalent. This is already asserted
   by tests.

---
name: Gmail Triage
description: A personal sorting tool for one inbox — every sender gets one clear decision.
colors:
  ink: "#0e1726"
  muted: "#64748b"
  hairline: "#e6eaf1"
  paper: "#ffffff"
  vip: "#d97706"
  ok: "#0f766e"
  junk: "#dc2626"
  review: "#7c3aed"
  fragmented-amber: "#b45309"
typography:
  title:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.75
  body:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
  label:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.33
    letterSpacing: "0.025em"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
    typography: "{typography.body}"
  button-action:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "8px 12px"
  card:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.xl}"
    padding: "16px"
  chip-filter:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    padding: "4px 12px"
  chip-list-badge:
    textColor: "{colors.paper}"
    rounded: "{rounded.sm}"
    padding: "2px 6px"
    typography: "{typography.label}"
  input-text:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  toast:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.lg}"
    padding: "12px 16px"
---

# Design System: Gmail Triage

## Overview

**Creative North Star: "The Field Notebook"**

Gmail Triage is one person's own sorting tool, not a product sold to strangers. It should feel the
way a well-kept field notebook does: personal and used daily, with an order that reflects its owner.
Each page holds plain records, and the marks on them carry meaning. The notebook is quiet so the
marks can speak. In this app the marks are the four action colours, VIP, OK, Junk and Review, and
everything around them steps back.

Density is high and calm. The owner triages in short, focused bursts, on the desktop at the keyboard
and on an iPhone with one thumb, so screens favour many legible rows over generous whitespace. Type
is small, sentence-case and set in the system face. Weight, not size, sets the hierarchy.

The notebook metaphor is the direction, and the current implementation only partly expresses it.
Today's neutrals are cool slate, and the surfaces are plain white with hairline borders. **Decided
2026-10-05, after the first critique:** the owner chose the *full notebook* direction (warm neutrals
throughout, notebook cues, more character in type). The alternatives were a light-touch tonal layer
and keeping today's cool slate. That redesign is tracked as future-release #64 and will replace this
file's Colors and Typography sections when it lands. Until then, the tokens below describe the code
as it is.

**Key Characteristics:**
- Quiet neutral chrome; colour is reserved for meaning.
- Dense, compact rows and controls; small sentence-case type in the system face.
- Weight (600) carries hierarchy, not large sizes.
- Rounded but not soft: 8–16px corners on controls and cards, full pills for filters.
- Every action has a labelled control; gestures and keys are accelerators.

## Colors

A cool slate neutral base, with four saturated action colours that each mean exactly one decision.

### Primary
- **Notebook Ink** (#0e1726): A near-black navy. Used for body text, page titles, primary buttons,
  toasts and the active nav state. It is the voice of the interface.

### Secondary
- **VIP Amber** (#d97706): The VIP decision, used for VIP and VIP & Clean, and for VIP list badges.
- **OK Teal** (#0f766e): The OK decision, used for OK and OK & Clean, and for OK list badges.
- **Junk Red** (#dc2626): Junk and every destructive action (Delete, Delete All, Reset Blocklist,
  Danger Zone).
- **Review Violet** (#7c3aed): Sending a message to Claude review.

### Tertiary
- **Fragmented Amber** (#b45309): Shown on an amber-tinted pill, it is the warning marker for an
  address stored under three or more names. It is the only warning colour outside the action set.

### Neutral
- **Pencil Grey** (#64748b): Secondary text, inactive nav tabs, labels and section headers.
- **Hairline** (#e6eaf1): Borders and dividers, plus translucent fills for row hover and quiet
  backgrounds.
- **Paper** (#ffffff): Cards, dialogs, sheets and inputs.

### Named Rules
**The One Meaning Rule.** Each action colour means one decision and nothing else. VIP amber never
decorates, and junk red appears only where something is removed. A colour that means two things
means nothing.

**The Quiet Chrome Rule.** Navigation, cards, inputs and secondary buttons stay in ink, pencil grey,
hairline and paper. If chrome needs colour to be found, the layout is wrong.

## Typography

**Body Font:** the system UI face (ui-sans-serif, system-ui, sans-serif)
**Mono Font:** the system monospace, used only for technical values

**Character:** One family, no display face. The interface reads like neat handwriting in a notebook
rather than a printed magazine, so hierarchy comes from weight and colour, not scale.

### Hierarchy
- **Title** (600, 1.125rem, 1.75): Page titles ("Triage 4", "Lists", "Settings").
- **Body** (400–600, 0.875rem, 1.43): Almost everything: rows, controls, buttons, form labels.
- **Label** (600, 0.75rem, letter-spacing 0.025em, uppercase for card headers): Card section headers
  ("LOCATIONS", "LAST 30 DAYS"), list badges, nav tab labels, metadata.

### Named Rules
**The Weight-Not-Size Rule.** Emphasis is 600 weight at body size. No size above 1.125rem appears in
the app. A bigger heading is a sign the screen is doing too much.

## Layout

The app shell is a single navigation element. On small screens it is a bottom tab bar, and from the
`md` breakpoint (768px) up it is a 64px left rail. The content scrolls beside or above it.

1. **Triage, desktop:** four panes: a fixed-width queue column (192px) of sender rows, the selected
   card, the message preview, and a column of action buttons.
2. **Triage, mobile:** a single swipe card capped at 28rem wide. Primary actions sit at the bottom in
   thumb reach, respecting the safe-area inset, and a "⋯" opens a bottom sheet with the rest.
3. **Lists:** a full-width bordered list with filter pills and a search field.
4. **Review and Events:** centred columns capped at 48rem.
5. **Settings:** a two-column card grid from the `lg` breakpoint, capped at 56rem.

Spacing runs on a 4px base. 8px and 12px gaps dominate, with 16px card padding. Rows use about 8px of
vertical padding, which is what makes the app dense.

## Elevation & Depth

The system is almost entirely flat. Surfaces separate by hairline borders and the white-on-white
change between page and card, not by shadow. Shadows appear only on things that float above the page:
the toast (large), the dialogs and bottom sheet (extra large), and a faint small shadow on a few
cards. The owner chose to let the next critique decide whether this stays flat or gains layered
depth, so treat the current state as the record, not the rule.

## Shapes

Corners are consistently rounded and scale with the element. Badges are 4px, buttons and inputs 8px,
action buttons and toasts 12px, and cards, dialogs and the queue panel 16px. Filter chips are full
pills. Bottom sheets round only their top corners. Borders are always 1px hairline. There are no
icons in the chrome: actions are words, and the only glyph is "⋯".

## Components

### Buttons
Plain, word-labelled and confident, with no icons.
- **Shape:** gently rounded (8px for standard buttons, 12px for triage action buttons).
- **Primary:** Notebook Ink fill with white 600-weight text at 6px × 12px ("Add", "Save").
- **Triage action, desktop:** a vertical column of full-width buttons, each **filled** with its action
  colour and white text at 0.75rem / 600 (`TriagePage.tsx`). All eleven actions are visible at once.
  *(Corrected 2026-10-05: an earlier draft described outlined coloured-text buttons in a row, which
  is `Deck.tsx`'s desktop branch, and that branch never renders.)*
- **Triage action, mobile:** white with a hairline border and coloured text in the action's colour,
  with a few filling the width and a "⋯" overflow sheet for the rest.
- **Secondary:** white with a hairline border and ink text ("Create Backup", "Run Auto-Clean Now").
- **Destructive:** a Junk Red fill with white text ("Reset Blocklist").
- **Disabled:** 40% opacity.

### Chips
- **Filter chips** (Lists): full pills with a hairline border. The selected chip is filled ink with
  white text, and each carries a count.
- **List badges:** small 4px-rounded filled tags in the tier colour, with white label-weight text,
  each with an inline "×" to remove.
- **Fragmented marker:** an amber-tinted pill with dark amber bold text. It reports and never acts.

### Cards / Containers
- **Corner Style:** 16px.
- **Background:** Paper on the page background.
- **Shadow Strategy:** none at rest (see Elevation & Depth).
- **Border:** 1px hairline.
- **Internal Padding:** 16px. The header is a Label-style uppercase pencil-grey title.

### Inputs / Fields
- **Style:** a 1px hairline stroke on white with 8px corners and 8px × 12px padding.
- **Focus:** the border turns ink. A dedicated focus-visible ring is not consistently defined across
  controls.

### Navigation
Six word-only tabs (Triage, Lists, Events, Review, Settings, Labeled) plus a "Legacy UI" link.
Inactive tabs are pencil grey and turn ink on hover. The active tab is ink at 600 weight. There is no
pill or underline: weight alone marks where you are. It is a left rail on desktop and a bottom bar on
mobile.

### Toast
Action feedback renders **inline in the Triage header**: the result of the last action, plus an
"Undo" button when the action can honestly be reversed. It clears after 6 seconds. An ink-filled
floating `Toast.tsx` component exists, but nothing renders it. *(Corrected 2026-10-05: an earlier
draft described the floating bar as live.)*

### Triage Card (signature)
The heart of the app is one sender at a time, showing name, address, subject, date and snippet, with
the full message available on demand. It is a swipe card on mobile and the centre pane on desktop.
Its action row is the only place where all four action colours appear together.

## Do's and Don'ts

### Do:
- **Do** keep each action colour tied to its single meaning (The One Meaning Rule).
- **Do** use 600 weight at 0.875rem for emphasis rather than a larger size.
- **Do** separate surfaces with 1px hairline borders and 8–16px radii, scaled to the element.
- **Do** give every action a labelled control; swipes and arrow keys are accelerators only.
- **Do** keep mobile primary actions at the bottom within thumb reach, respecting the safe-area
  inset.

### Don't:
- **Don't** use the Strasz Assessment Systems brand palette in this app (owner's decision,
  2026-10-05).
- **Don't** introduce a display font or headings larger than 1.125rem.
- **Don't** use junk red for anything that does not remove something.
- **Don't** add colour to chrome (nav, cards, inputs) to make it stand out.
- **Don't** reference colour utilities that have no token. The desktop queue's `bg-tint` currently
  renders nothing, because no `tint` token is defined.

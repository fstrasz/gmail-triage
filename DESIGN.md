---
name: Gmail Triage
description: One owner's field notebook for his inbox — every sender gets one decision, stamped in ink.
colors:
  desk: "#ebe5da"
  paper: "#fbf8f2"
  sunk: "#f3eee5"
  rule: "#ddd5c7"
  rule-strong: "#c9bfae"
  ink: "#231d16"
  graphite: "#4d453c"
  muted: "#6b6155"
  board: "#2f2822"
  board-ink: "#d9cfc0"
  on-fill: "#fbf8f2"
  vip: "#985600"
  ok: "#0b6b60"
  junk: "#b4261a"
  review: "#6a3dbf"
  letter: "#ffffff"
  desk-night: "#15120e"
  paper-night: "#211d18"
  sunk-night: "#1a1713"
  rule-night: "#352f27"
  rule-strong-night: "#4a4237"
  ink-night: "#efe8dc"
  graphite-night: "#cfc5b5"
  muted-night: "#a99e8e"
  board-night: "#2b251e"
  board-ink-night: "#b8ad9c"
  on-fill-night: "#15120e"
  vip-night: "#f2ad4b"
  ok-night: "#4cc7b4"
  junk-night: "#f27b6b"
  review-night: "#b9a2f7"
typography:
  headline:
    fontFamily: "Recursive, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.01em"
    fontVariation: "'CASL' 1"
  title:
    fontFamily: "Recursive, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.375
    letterSpacing: "-0.01em"
    fontVariation: "'CASL' 1"
  body:
    fontFamily: "Recursive, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
    fontVariation: "'CASL' 0"
  action:
    fontFamily: "Recursive, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 700
    lineHeight: 1.4
    fontVariation: "'CASL' 0"
  label:
    fontFamily: "Recursive, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 700
    lineHeight: 1.45
    letterSpacing: "0.08em"
    fontVariation: "'CASL' 0"
  stamp:
    fontFamily: "Recursive, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.06em"
    fontVariation: "'CASL' 0"
  numeric:
    fontFamily: "Recursive, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    fontFeature: "'tnum' 1"
rounded:
  stamp: "4px"
  key: "5px"
  letter: "6px"
  control: "8px"
  thumb: "12px"
  sheet: "16px"
  pill: "9999px"
spacing:
  hair: "2px"
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  target-coarse: "44px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-fill}"
    rounded: "{rounded.control}"
    padding: "6px 12px"
    typography: "{typography.body}"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "6px 12px"
  button-secondary-hover:
    backgroundColor: "{colors.sunk}"
  button-danger-confirm:
    backgroundColor: "{colors.junk}"
    textColor: "{colors.on-fill}"
    rounded: "{rounded.control}"
    padding: "6px 12px"
  button-danger-outline:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.junk}"
    rounded: "{rounded.control}"
    padding: "6px 12px"
  action-workbench:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.control}"
    padding: "6px 10px"
    typography: "{typography.action}"
  action-thumb:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.thumb}"
    padding: "0 12px"
    height: "48px"
  input-text:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "6px 10px"
  pill:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.graphite}"
    rounded: "{rounded.pill}"
    padding: "4px 12px"
  pill-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-fill}"
    rounded: "{rounded.pill}"
    padding: "4px 12px"
  sheet:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.sheet}"
    padding: "16px"
  stamp:
    rounded: "{rounded.stamp}"
    padding: "1px 6px"
    typography: "{typography.stamp}"
  key-cap:
    backgroundColor: "{colors.sunk}"
    textColor: "{colors.ink}"
    rounded: "{rounded.key}"
    padding: "0 6px"
  nav-cover:
    backgroundColor: "{colors.board}"
    textColor: "{colors.board-ink}"
  nav-tab-active:
    backgroundColor: "{colors.desk}"
    textColor: "{colors.ink}"
    rounded: "{rounded.thumb}"
  letter:
    backgroundColor: "{colors.letter}"
    rounded: "{rounded.letter}"
    width: "760px"
---

# Design System: Gmail Triage

## Overview

**Creative North Star: "The Field Notebook"**

Gmail Triage is one owner's field notebook laid open on a desk. The desk is the warm ground every
screen sits on. The pages are paper sheets with ruled edges. A dark bookcloth cover holds the index
of tabs. Decisions are marked on the page with ink stamps. The app supervises mail automation for a
single person, so it is meant to read like his own notebook and not like a product sold to strangers.
It deliberately refuses the grey SaaS default of white cards, slate text and one blue accent.

Density is high and calm. Triage happens in short bursts, at a desk with the keyboard or on an iPhone
with one thumb, so screens favour many legible rows over generous whitespace. One typeface,
Recursive, does all the work. Body text runs it as a plain sans, and titles lean into its casual axis,
so headings read as the owner's handwriting over a printed page. Depth is tonal: desk, sunk paper and
paper. The only shadow belongs to things that float, plus the sender's letter laid on the page.

This world replaced an earlier cool-slate interface in October 2026. The owner rejected the Strasz
Assessment Systems brand palette for this app on 2026-10-05, and the notebook direction is his pinned
choice (future-release #64). The dark theme, "desk at night", mirrors every surface and ink, and it
is a supported theme rather than an extra.

**Key Characteristics:**
- A warm desk, paper sheets with ruled edges, and a dark cover that holds the index.
- Four decision inks (VIP, OK, Junk, Review), used as text, outlines and stamps, each meaning one decision.
- The ink stamp is the signature mark for tier badges, list badges, action results and the swipe preview.
- One family, Recursive: linear body, casual titles, tabular numerals.
- Flat tonal layers. A shadow means "floating" (or the letter laid on the page).
- Layout is chosen by both room and pointer type. Touch gets 44px targets everywhere.

## Colors

Warm paper neutrals on a tan desk, a dark cover, and four saturated inks that each carry exactly one
decision. Every value has a night counterpart (the `-night` tokens) that mirrors its role. Theme
follows the OS unless Settings pins light or dark, and the pin is stored per device, because an
iPhone in low light and a desk monitor can want different themes.

### Primary
- **Notebook Ink** (`ink`): Warm near-black. Used for body text, titles, primary buttons, the active
  filter pill, the focus ring and key caps. It is the interface's voice. At night it becomes a warm
  off-white (`ink-night`).

### Secondary: the decision inks
- **Marigold** (`vip`): The VIP decision, used for VIP and VIP & Clean, VIP stamps and VIP list badges.
- **Ledger Teal** (`ok`): The OK decision, used for OK and OK & Clean, "Keep" in Review, OK stamps, and
  the native control accent (checkboxes).
- **Correction Red** (`junk`): Junk, Blocklist, and every action that removes something (Delete,
  Delete All, Reset & Rebuild, Reset Blocklist).
- **Review Violet** (`review`): Sending a message to Claude review.

All four clear 4.5:1 on paper in both themes: 5.40, 6.03, 6.13 and 6.53 on day paper, and 8.66,
8.09, 6.24 and 7.64 on night paper. The cool-slate VIP amber they replaced (#d97706) was only 3.19:1
on white.

### Tertiary
- **Cover Board** (`board`, `board-ink`): The bookcloth cover. It is the background of the nav rail
  (desktop) and the tab bar (phone), and it fills the top safe-area inset. Its pale tan ink labels the
  inactive tabs. It is also the browser/status-bar `theme-color` in both themes (#2f2822 by day,
  #2b251e by night), so iOS's white status text stays legible.

### Neutral
- **Desk** (`desk`): The ground under every page and the colour of the active index tab, which is cut
  from the cover so it opens onto the page.
- **Paper** (`paper`): Sheets, cards, dialogs, inputs, and resting buttons.
- **Sunk Paper** (`sunk`): A recessed paper tone for side columns (queue, action column), key caps,
  read-only blocks, button hover, and the margin around the letter.
- **Rule** (`rule`) / **Strong Rule** (`rule-strong`): 1px sheet edges and dividers / control
  outlines, dashed separators and scrollbar thumbs. `hairline` remains a legacy alias of `rule`.
- **Graphite** (`graphite`): Secondary reading text (snippets, explanations) and the neutral moves
  (Archive, Unsub, Archive All) that file mail without a judgement.
- **Pencil** (`muted`): Metadata, dates, section labels and placeholders.
- **Letter White** (`letter`): Pure white used ONLY behind the sender's email HTML.
- **Scrim**: ink at 45% (black at 60% at night) behind dialogs and sheets.

### Named Rules
**The One Meaning Rule.** Each decision ink means one decision and nothing else. Marigold never
decorates, correction red appears only where something is removed, and neutral moves borrow no
decision colour. A colour that means two things means nothing.

**The Ink-Not-Paint Rule.** Decision inks are applied as text, 1–1.5px outlines and stamps (with at
most a 7% wash of their own ink). The only solid ink fill is the final confirm button of a destructive
act (Reset Blocklist, a guarded Delete). A filled decision colour anywhere else is wrong.

**The Quiet Chrome Rule.** The cover is the one coloured chrome. The board-coloured rail or tab bar
holds the index, and everything else (sheets, inputs, secondary buttons, pills) stays in paper, ink,
graphite and rule. If a control needs colour to be found, the layout is wrong.

**The Sender's Letter Rule.** Email HTML is shown in a sandboxed iframe on Letter White, laid on the
page as an inset letter. The sender's own colours are never restyled or themed, including at night.

## Typography

**Font:** Recursive (vendored, OFL, variable weight 300–1000 with the Casual axis), falling back to
ui-sans-serif, system-ui, sans-serif. Monospace roles use the same family.

**Character:** One family with two hands. Body text is set at CASL 0, a plain and readable linear sans.
Page titles and the email subject in the preview are set at CASL 1, the owner's handwriting, with
-0.01em tracking. Numerals that align (counts, dates, key caps) are tabular.

### Hierarchy
- **Headline** (600, 1.25rem, casual): Page titles ("Triage 13", "Lists", "Settings"). The queue count
  sits beside the title in pencil at 500 weight.
- **Title** (600, 1.125rem, casual): The previewed email subject, dialog titles and empty-state lines.
- **Body** (400–600, 0.875rem, 1.43): Rows, controls, buttons, form labels. A sender's name is 600 at
  0.875–1rem, and the subject on a phone card is 600 at 0.9375rem.
- **Action** (700, 0.8125rem): Workbench action buttons. Thumb buttons on the phone are 700 at
  0.9375rem.
- **Label** (700, 0.6875rem, 0.08em tracking, uppercase, pencil): Group names inside a sheet ("Queue",
  "Keep", "Remove", "Draft reply", a location group). Nav tab labels are 600 at the same size.
- **Stamp** (700, 0.6875rem, 0.06em tracking, uppercase): Badge text inside a stamp.

### Named Rules
**The Two Hands Rule.** Casual (CASL 1) is for titles only. Body, labels, stamps and data stay linear
(CASL 0). A casual paragraph reads as noise.

**The Weight-Over-Size Rule.** Emphasis is weight at body size. Nothing in the app exceeds 1.25rem
except the enlarged swipe-preview stamp (1.25rem, 0.12em tracking).

## Layout

The app shell is one `nav` element on the cover. On phones (under 768px) it is a bottom tab bar, with
the content sheet's bottom corners rounded at 16px above it. From 768px it is a 76px left rail, and the
desk's top-left corner is rounded at 16px against the cover. The active tab is filled with the desk
colour and joins the page like an index tab. The **Legacy** link sits at the foot of the rail on
desktop. On phones it is in the Settings header ("Legacy UI"), because the tab bar has no room.

**Triage layout is chosen by room as well as pointer type:**
1. **Phone (touch, under 768px):** the swipe deck. One card (capped at 28rem) with up to two peeking
   behind it, then a line with Prev and Next at either end and feedback and Undo between them (the
   queue position, "3 of 13", when there is no feedback), then three thumb buttons plus "⋯" in thumb
   reach above the safe-area inset, then the Hide VIP/OK pill.
2. **Touch at 768px and up (iPad portrait):** a tappable 240px queue sheet beside the same deck.
3. **Fine pointer at 768px and up, or any device at 1024px and up:** the four-pane workbench. It is one
   sheet split into a sunk queue (208–288px), a sunk action column (160px) of grouped actions with key
   caps, and a paper preview with the sender, a stamp, and the subject in the casual hand. Below the
   preview, the email letter is centred on a sunk margin and capped at 760px.

Keyboard shortcuts are live in both the workbench and the tablet layout.

Other screens are single columns anchored at the page's left padding and capped at 56rem (Lists,
Labeled, Settings, whose cards form a two-column grid from 1024px). Events is a centred 48rem column.
Review is a list-and-detail split.

Spacing runs on a 4px base. Page padding is 12, 16 or 20px by breakpoint. Gaps between controls are
mostly 8px and 12px, sheets pad 16–20px, and rows pad 8px vertically, which is what keeps the app dense.

**Coarse pointers** (iPhone, iPad) get 44px minimum targets on every button, pill, link action and
input, and 16px input text so iOS does not zoom on focus.

## Elevation & Depth

Depth is tonal, not shadowed. Three paper tones stack: desk, then sunk paper for side columns and
recessed blocks, then paper for the working sheet. Edges are 1px rules. One shadow exists, `float`,
and it marks things that leave the page: dialogs, the "⋯" bottom sheet, and the sender's letter laid
on the preview pane. Peeking deck cards show depth by scale and offset (each 3.5% smaller, 9px lower,
25% fainter), not by shadow.

### Shadow Vocabulary
- **Float** (`box-shadow: 0 12px 32px -8px rgb(20 14 8 / 0.28), 0 2px 6px rgb(20 14 8 / 0.12)`):
  Dialogs, bottom sheets and the inset letter. Nothing that rests on the page.

### Named Rules
**The Flat Page Rule.** Anything on the page is flat. A shadow means the element is lying on top of
the page, either floating or laid there as a letter.

## Shapes

Corners scale with the object. Stamps are 4px, key caps 5px, the letter 6px, buttons and inputs 8px,
thumb buttons and index tabs 12px, and sheets, dialogs and the deck card 16px. Bottom sheets round only
their top corners. Pills are fully round. Stamps use a 1.5px border in their own ink, and everything
else uses 1px rules. Dashed strong rules mark a change of kind within a sheet: the swipe legend, the
sender-wide actions group, and pencilled "note" stamps. Icons are Lucide line icons at 1.75–2px
stroke, sized 14–22px, used in the nav, as the "⋯" overflow, for swipe directions and in small metadata
lines. Actions themselves are always words.

## Components

### Buttons
Word-labelled and confident, on paper.
- **Shape:** gently rounded (8px).
- **Primary:** an ink fill with paper text at 600 weight ("Add", "Save", "Search Now"). It lightens to
  85% ink on hover.
- **Secondary:** paper with a strong-rule outline and ink text. Hover shifts it to sunk paper.
- **Danger outline:** paper with a 50% correction-red outline and red text ("Reset & Rebuild"), with a
  10% red wash on hover.
- **Danger confirm:** a correction-red fill with paper text. It appears only as the last step of a
  destructive dialog.
- **Quiet:** pencil text with no border, turning ink on a sunk hover.
- **Link action:** ink 600 text with a strong-rule underline at 3px offset that darkens to ink on hover
  ("Edit", "Undo", "Legacy UI").
- **Disabled:** 40% opacity, no pointer events.

### Triage actions
- **Workbench:** a column of full-width paper buttons with a strong-rule outline. Text is in the
  action's ink (700, 0.8125rem) with a right-aligned key cap. On hover the border takes the ink and a 7%
  wash appears. They are grouped under labels: Keep, Keep & Clean, File, Remove. "All from this sender"
  is set apart below a dashed rule at the foot of the column.
- **Thumb row (phone/tablet):** 48px-tall paper buttons with 12px corners and 0.9375rem bold ink-coloured
  text, plus a 56px "⋯" that opens a bottom sheet with the rest. Pressed state is sunk paper.
- **Prev / Next (phone/tablet):** Quiet buttons (pencil word plus a Lucide chevron) that only change
  which card is on top. They never act, so they carry no decision ink and leave no Undo. Each is
  disabled at its end of the queue. They are the labelled control behind `j`/`k`.

### Stamp (signature)
The notebook's mark is a decision inked onto the page. It is an uppercase 0.6875rem bold word in a 4px
box with a 1.5px border in its own ink and a 7% wash of the same ink. Tones are vip, ok, junk, review,
graphite (neutral moves), and note (dashed graphite, for pencilled observations like "Fragmented").
- **Tier and list badges:** VIP and OK on cards and queue rows, and list entries such as "BLOCKLIST ·
  ANY NAME ×".
- **Action result:** the result stamp presses in (180ms scale 1.12 to 1, ease-out-expo) beside the
  feedback line and Undo. This is skipped under reduced motion.
- **Swipe preview:** while a card is dragged, the decision the release will make is stamped across the
  card at -6°, with a 3px border and 1.25rem text, inking in from 25% to full as the drag nears the
  commit threshold.
- **Done:** an empty inbox shows an OK "Done" stamp tilted -3°.

### Chips / Pills
- **Filter and toggle pills:** fully round, 4px × 12px. At rest they are paper with a strong-rule
  outline and graphite text. Active is an ink fill with paper text. They are paired with `aria-pressed`
  and carry counts in tabular numerals ("VIP 12").

### Cards / Containers (sheets)
- **Corner Style:** 16px.
- **Background:** paper on desk. Side columns inside a sheet are sunk paper.
- **Shadow Strategy:** none (see Elevation & Depth).
- **Border:** 1px rule.
- **Internal Padding:** 16px, rising to 20px on wider phone cards and dialogs.

### Inputs / Fields
- **Style:** paper with a 1px strong rule, 8px corners, 6px × 10px padding, ink text and pencil
  placeholders. The caret is ink, and checkboxes take the teal accent.
- **Focus:** the global keyboard focus ring is a 2px ink outline at 2px offset with 6px rounding. It is
  the same everywhere.
- **Coarse pointer:** 44px tall with 16px text.

### Key cap
A small sunk-paper key with a strong-rule border, 5px corners and 0.75rem semibold tabular text. It
appears beside workbench actions and in the Shortcuts dialog.

### Navigation
The cover holds six tabs (Triage, Lists, Events, Review, Settings, Labeled). Each is a 20px line icon
over a 0.6875rem semibold label, 44px tall on phones and 56px in the rail. Inactive tabs are board-ink
and turn bright on hover. The active tab is cut out of the cover in desk colour with ink text: it hangs
down from the page on phones and reaches right into the page in the rail. Legacy is a plain anchor at
the foot of the rail (desktop only), deliberately leaving the SPA.

### Letter (email body)
The sender's HTML is shown in a sandboxed iframe on Letter White with a 1px rule border. In the
workbench it is centred on a sunk margin, capped at 760px, with 6px corners and the float shadow. On
the phone card it opens inline under "Show message" at 8px corners. Its content is never restyled.

## Do's and Don'ts

### Do:
- **Do** keep each decision ink tied to its single meaning (The One Meaning Rule), and render neutral
  moves in graphite.
- **Do** apply decision inks as text, outlines and stamps. Reserve a solid ink fill for the final
  destructive confirm.
- **Do** use the Stamp for every tier, list or result mark, so a colour always arrives in the same form.
- **Do** separate surfaces by tone (desk, sunk, paper) and 1px rules. Use the float shadow only for
  dialogs, sheets and the letter.
- **Do** set titles in Recursive at CASL 1 and everything else at CASL 0. Use tabular numerals for counts
  and dates.
- **Do** give coarse pointers 44px targets and 16px input text.
- **Do** define both a day and a night value for any new colour token, and check decision inks at 4.5:1
  on paper in both themes.
- **Do** keep every action reachable by a labelled control. Swipes and keys are accelerators.

### Don't:
- **Don't** use the Strasz Assessment Systems brand palette in this app (owner's decision, 2026-10-05).
- **Don't** return to the grey SaaS default: white cards, slate text, one blue accent.
- **Don't** colour any chrome except the cover. Sheets, inputs and secondary buttons stay paper and ink.
- **Don't** restyle, invert or theme the sender's email HTML. It always sits on Letter White.
- **Don't** use correction red for anything that does not remove something.
- **Don't** set body copy, labels or data in the casual axis.
- **Don't** put a shadow on anything resting on the page.
- **Don't** use colour utilities that have no token. Every colour must resolve to a variable in
  `tokens.css`.

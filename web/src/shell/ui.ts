// Shared control vocabulary. One button shape, one input, one dialog — so a
// "Save" looks the same on every screen. Coarse pointers (iPhone, iPad) get
// 44px targets and 16px input text (smaller text makes iOS zoom on focus).

const BTN_BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors duration-150 disabled:pointer-events-none disabled:opacity-40 pointer-coarse:min-h-11 pointer-coarse:px-4";

export const btnPrimary = `${BTN_BASE} bg-ink text-on-fill hover:bg-ink/85`;
export const btnSecondary = `${BTN_BASE} border border-rule-strong bg-paper text-ink hover:bg-sunk`;
export const btnDanger = `${BTN_BASE} bg-junk text-on-fill hover:bg-junk/85`;
export const btnDangerOutline = `${BTN_BASE} border border-junk/50 bg-paper text-junk hover:bg-junk/10`;
export const btnQuiet = `${BTN_BASE} text-muted hover:bg-sunk hover:text-ink`;

/** Inline text action ("Edit", "Undo", "Reconnect"). */
export const linkAction =
  "font-semibold text-ink underline decoration-rule-strong underline-offset-[3px] hover:decoration-ink pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center";

export const input =
  "rounded-lg border border-rule-strong bg-paper px-2.5 py-1.5 text-sm text-ink placeholder:text-muted pointer-coarse:min-h-11 pointer-coarse:text-base";

/** Filter / toggle pill. Pair with aria-pressed. */
export function pill(active: boolean): string {
  return `inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors duration-150 pointer-coarse:min-h-11 pointer-coarse:px-4 ${
    active
      ? "border-ink bg-ink text-on-fill"
      : "border-rule-strong bg-paper text-graphite hover:text-ink"
  }`;
}

/** A sheet of paper on the desk. */
export const sheet = "rounded-2xl border border-rule bg-paper";

/** Section label inside a sheet ("Queue", "Draft reply"). */
export const label =
  "text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-muted";

export const dialogOverlay = "fixed inset-0 z-50 bg-scrim";
export const dialogContent =
  "fixed left-1/2 top-1/2 z-50 w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-rule bg-paper p-5 text-ink shadow-float";
export const dialogTitle = "title-hand text-lg font-semibold text-ink";

/** A key cap ("E", "?", "←"). */
export const kbd =
  "inline-flex min-w-6 items-center justify-center rounded-[5px] border border-rule-strong bg-sunk px-1.5 text-xs font-semibold text-ink";

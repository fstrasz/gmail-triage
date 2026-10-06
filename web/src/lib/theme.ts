// Theme preference: follow the OS by default, or pin light/dark from Settings.
// Stored per device (an iPhone in low light and a desk monitor can differ).

export type ThemePref = "system" | "light" | "dark";

const KEY = "gmail-triage:theme";

// The status-bar / browser-chrome colour is the notebook cover (board) in both
// themes, so iOS's white status text stays legible over the top inset.
const THEME_COLOR = { light: "#2f2822", dark: "#2b251e" } as const;

export function loadTheme(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(pref: ThemePref): void {
  const root = document.documentElement;
  if (pref === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", pref);

  const dark =
    pref === "dark" ||
    (pref === "system" &&
      window.matchMedia?.("(prefers-color-scheme: dark)").matches === true);
  document
    .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
    .forEach((m) => {
      m.content = dark ? THEME_COLOR.dark : THEME_COLOR.light;
    });
}

export function saveTheme(pref: ThemePref): void {
  try {
    if (pref === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    // Private mode / storage disabled: the choice lasts for this session only.
  }
  applyTheme(pref);
}

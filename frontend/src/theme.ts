export type Theme = "light" | "dark";

const STORAGE_KEY = "gitreant-theme";

/** Use the stored value if valid, otherwise fall back to the OS preference. */
export function resolveTheme(stored: string | null, prefersDark: boolean): Theme {
  if (stored === "light" || stored === "dark") return stored;
  return prefersDark ? "dark" : "light";
}

export function toggleTheme(current: Theme): Theme {
  return current === "dark" ? "light" : "dark";
}

/** Radius of a circle centred at (x, y) that covers the whole w x h area. */
export function coverRadius(x: number, y: number, w: number, h: number): number {
  return Math.hypot(Math.max(x, w - x), Math.max(y, h - y));
}

/** The theme currently applied to the document. */
export function currentTheme(): Theme {
  return resolveTheme(document.documentElement.dataset.theme ?? null, false);
}

/** Apply a theme to the document and persist it. */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // localStorage may be unavailable; the DOM change alone is enough.
  }
}

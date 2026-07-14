import { createContext, useContext } from "react";

/** How action buttons render: an icon, an icon with its label, or text only. */
export type ButtonStyle = "icon" | "icon-label" | "label";

export const BUTTON_STYLE_KEY = "gitreant-button-style";

/** The stored value, falling back to the icon+label default. */
export function parseButtonStyle(value: string | null): ButtonStyle {
  return value === "icon" || value === "label" ? value : "icon-label";
}

export function storedButtonStyle(): ButtonStyle {
  try {
    return parseButtonStyle(localStorage.getItem(BUTTON_STYLE_KEY));
  } catch {
    return "icon-label";
  }
}

export function storeButtonStyle(style: ButtonStyle) {
  try {
    localStorage.setItem(BUTTON_STYLE_KEY, style);
  } catch {
    // localStorage may be unavailable; the state change alone is enough.
  }
}

export const SettingsContext = createContext<{ buttonStyle: ButtonStyle }>({
  buttonStyle: "icon-label",
});

export function useButtonStyle(): ButtonStyle {
  return useContext(SettingsContext).buttonStyle;
}

import { createContext, useContext } from "react";
import {
  format,
  MESSAGES,
  parseLangSetting,
  LANG_KEY,
  type Lang,
  type LangSetting,
  type MsgKey,
} from "./i18n";

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

export function storedLangSetting(): LangSetting {
  try {
    return parseLangSetting(localStorage.getItem(LANG_KEY));
  } catch {
    return "auto";
  }
}

export function storeLangSetting(setting: LangSetting) {
  try {
    localStorage.setItem(LANG_KEY, setting);
  } catch {
    // localStorage may be unavailable; the state change alone is enough.
  }
}

export const SettingsContext = createContext<{
  buttonStyle: ButtonStyle;
  lang: Lang;
}>({
  buttonStyle: "icon-label",
  lang: "en",
});

export function useButtonStyle(): ButtonStyle {
  return useContext(SettingsContext).buttonStyle;
}

/** The translation lookup for the active language. */
export function useT(): (
  key: MsgKey,
  params?: Record<string, string | number>,
) => string {
  const { lang } = useContext(SettingsContext);
  return (key, params) => format(MESSAGES[lang][key], params);
}

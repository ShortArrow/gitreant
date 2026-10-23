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
import {
  DATE_FORMAT_KEY,
  formatTime,
  parseDateFormat,
  type DateFormat,
} from "./time";

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

export function storedDateFormat(): DateFormat {
  try {
    return parseDateFormat(localStorage.getItem(DATE_FORMAT_KEY));
  } catch {
    return "iso";
  }
}

export function storeDateFormat(format: DateFormat) {
  try {
    localStorage.setItem(DATE_FORMAT_KEY, format);
  } catch {
    // localStorage may be unavailable; the state change alone is enough.
  }
}

export const SQUASH_LINKS_KEY = "gitreant-squash-links";

/** Whether the dashed squash-merge links are drawn (default on). */
export function storedSquashLinks(): boolean {
  try {
    return localStorage.getItem(SQUASH_LINKS_KEY) !== "off";
  } catch {
    return true;
  }
}

export function storeSquashLinks(on: boolean) {
  try {
    localStorage.setItem(SQUASH_LINKS_KEY, on ? "on" : "off");
  } catch {
    // localStorage may be unavailable; the state change alone is enough.
  }
}

export const THICKNESS_KEY = "gitreant-thickness";

/** Whether the graph is drawn with the thickness of each commit's lines
 * (ADR 0044; default on). */
export function storedThickness(): boolean {
  try {
    return localStorage.getItem(THICKNESS_KEY) !== "off";
  } catch {
    return true;
  }
}

export function storeThickness(on: boolean) {
  try {
    localStorage.setItem(THICKNESS_KEY, on ? "on" : "off");
  } catch {
    // localStorage may be unavailable; the state change alone is enough.
  }
}

export const VIM_KEYS_KEY = "gitreant-vim-keys";

/** Whether `hjkl` move the graph selection besides the arrows (default
 * off, ADR 0035). */
export function storedVimKeys(): boolean {
  try {
    return localStorage.getItem(VIM_KEYS_KEY) === "on";
  } catch {
    return false;
  }
}

export function storeVimKeys(on: boolean) {
  try {
    localStorage.setItem(VIM_KEYS_KEY, on ? "on" : "off");
  } catch {
    // localStorage may be unavailable; the state change alone is enough.
  }
}

export const STASH_INTERNALS_KEY = "gitreant-stash-internals";

/** Whether a stash's index/untracked internals are revealed with dashed
 * links (default off — each stash reads as a single node). */
export function storedStashInternals(): boolean {
  try {
    return localStorage.getItem(STASH_INTERNALS_KEY) === "on";
  } catch {
    return false;
  }
}

export function storeStashInternals(on: boolean) {
  try {
    localStorage.setItem(STASH_INTERNALS_KEY, on ? "on" : "off");
  } catch {
    // localStorage may be unavailable; the state change alone is enough.
  }
}

export const AVATARS_KEY = "gitreant-avatars";

/** Whether GitHub author avatars are shown on commit rows (default on). */
export function storedAvatars(): boolean {
  try {
    return localStorage.getItem(AVATARS_KEY) !== "off";
  } catch {
    return true;
  }
}

export function storeAvatars(on: boolean) {
  try {
    localStorage.setItem(AVATARS_KEY, on ? "on" : "off");
  } catch {
    // localStorage may be unavailable; the state change alone is enough.
  }
}

export const SUBMODULE_LINKS_KEY = "gitreant-submodule-links";

/** Whether a superproject's graph shows its submodules' graphs beside it,
 * with dashed pointer-correlation links (default on — the regions only
 * appear when a repository actually declares submodules). */
export function storedSubmoduleLinks(): boolean {
  try {
    return localStorage.getItem(SUBMODULE_LINKS_KEY) !== "off";
  } catch {
    return true;
  }
}

export function storeSubmoduleLinks(on: boolean) {
  try {
    localStorage.setItem(SUBMODULE_LINKS_KEY, on ? "on" : "off");
  } catch {
    // localStorage may be unavailable; the state change alone is enough.
  }
}

export const COLLAPSED_SUBMODULES_KEY = "gitreant-collapsed-submodules";

/** The stored value as an object of repository id to paths; anything else
 * (unset, corrupted) reads as empty. */
function collapsedSubmodulesMap(raw: string | null): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw ?? "{}");
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** The collapsed submodule paths of `repoId` in a stored value. */
export function collapsedSubmodulesIn(
  raw: string | null,
  repoId: string,
): Set<string> {
  const paths = collapsedSubmodulesMap(raw)[repoId];
  return new Set(
    Array.isArray(paths)
      ? paths.filter((p): p is string => typeof p === "string")
      : [],
  );
}

/** The stored value with `repoId`'s collapsed paths replaced by `paths`. */
export function withCollapsedSubmodules(
  raw: string | null,
  repoId: string,
  paths: Set<string>,
): string {
  const all = collapsedSubmodulesMap(raw);
  if (paths.size === 0) delete all[repoId];
  else all[repoId] = [...paths];
  return JSON.stringify(all);
}

/** The paths of a repository's submodules whose graph regions are collapsed
 * (#18), kept per repository id. */
export function storedCollapsedSubmodules(repoId: string): Set<string> {
  try {
    return collapsedSubmodulesIn(
      localStorage.getItem(COLLAPSED_SUBMODULES_KEY),
      repoId,
    );
  } catch {
    return new Set();
  }
}

export function storeCollapsedSubmodules(repoId: string, paths: Set<string>) {
  try {
    localStorage.setItem(
      COLLAPSED_SUBMODULES_KEY,
      withCollapsedSubmodules(
        localStorage.getItem(COLLAPSED_SUBMODULES_KEY),
        repoId,
        paths,
      ),
    );
  } catch {
    // localStorage may be unavailable; the state change alone is enough.
  }
}

export const SettingsContext = createContext<{
  buttonStyle: ButtonStyle;
  lang: Lang;
  dateFormat: DateFormat;
  squashLinks: boolean;
  thickness: boolean;
  stashInternals: boolean;
  avatars: boolean;
  submoduleLinks: boolean;
  vimKeys: boolean;
}>({
  buttonStyle: "icon-label",
  lang: "en",
  dateFormat: "iso",
  squashLinks: true,
  thickness: true,
  stashInternals: false,
  avatars: true,
  submoduleLinks: true,
  vimKeys: false,
});

/** Renders a Unix-second timestamp in the chosen format. Callers pair it
 * with `absoluteTime` as the tooltip so no format hides the exact moment. */
export function useTime(): (seconds: number) => string {
  const { dateFormat, lang } = useContext(SettingsContext);
  return (seconds) =>
    formatTime(new Date(seconds * 1000), dateFormat, lang, new Date());
}

/** Whether the graph is drawn with its thickness (ADR 0044). */
export function useThickness(): boolean {
  return useContext(SettingsContext).thickness;
}

/** Whether squash-merge links should be drawn. */
export function useSquashLinks(): boolean {
  return useContext(SettingsContext).squashLinks;
}

/** Whether a stash's internal structure is revealed with dashed links. */
export function useStashInternals(): boolean {
  return useContext(SettingsContext).stashInternals;
}

/** Whether GitHub author avatars are shown on commit rows. */
export function useAvatars(): boolean {
  return useContext(SettingsContext).avatars;
}

/** Whether submodule graph regions and their dashed links are drawn. */
export function useSubmoduleLinks(): boolean {
  return useContext(SettingsContext).submoduleLinks;
}

/** Whether `hjkl` move the graph selection besides the arrows. */
export function useVimKeys(): boolean {
  return useContext(SettingsContext).vimKeys;
}

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

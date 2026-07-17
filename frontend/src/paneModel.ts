/** Pane layout transitions (ADR 0022): an array of panes, each with its
 * own tab list, and one focused pane. A repository lives in exactly one
 * pane; "open right" moves its tab. Pure functions so the rules stay
 * unit-testable apart from React. */

export interface Pane {
  tabs: string[];
  activeId: string | null;
}

export interface PaneLayout {
  panes: Pane[];
  focused: number;
}

export const emptyLayout: PaneLayout = {
  panes: [{ tabs: [], activeId: null }],
  focused: 0,
};

/** Drop panes that ran out of tabs (keeping at least one) and re-anchor
 * the focus on `focus`, which may itself have been dropped. */
function normalize(panes: Pane[], focus: Pane): PaneLayout {
  const kept = panes.filter((pane) => pane.tabs.length > 0);
  if (kept.length === 0) kept.push({ tabs: [], activeId: null });
  const focused = kept.indexOf(focus);
  return {
    panes: kept,
    focused: focused >= 0 ? focused : Math.min(panes.indexOf(focus), kept.length - 1),
  };
}

function paneOf(layout: PaneLayout, id: string): number {
  return layout.panes.findIndex((pane) => pane.tabs.includes(id));
}

/** Open `id` in the focused pane; if it is already open somewhere, focus
 * that pane and activate it instead of duplicating. */
export function openTab(layout: PaneLayout, id: string): PaneLayout {
  const existing = paneOf(layout, id);
  const target = existing >= 0 ? existing : layout.focused;
  const panes = layout.panes.map((pane, i) =>
    i === target
      ? {
          tabs: pane.tabs.includes(id) ? pane.tabs : [...pane.tabs, id],
          activeId: id,
        }
      : pane,
  );
  return { panes, focused: target };
}

/** Move `id` into pane `target` (creating it at the right edge when the
 * index is one past the end), activate and focus it. The emptied source
 * pane disappears. */
export function moveTab(
  layout: PaneLayout,
  id: string,
  target: number,
): PaneLayout {
  const stripped = layout.panes.map((pane) =>
    pane.tabs.includes(id)
      ? {
          tabs: pane.tabs.filter((tab) => tab !== id),
          activeId:
            pane.activeId === id
              ? (pane.tabs.filter((tab) => tab !== id).at(-1) ?? null)
              : pane.activeId,
        }
      : pane,
  );
  while (stripped.length <= target) {
    stripped.push({ tabs: [], activeId: null });
  }
  const destination = {
    tabs: [...stripped[target].tabs, id],
    activeId: id,
  };
  stripped[target] = destination;
  return normalize(stripped, destination);
}

/** Close `id` wherever it is; its pane activates the last remaining tab
 * and disappears once empty. */
export function closeTab(layout: PaneLayout, id: string): PaneLayout {
  const source = paneOf(layout, id);
  if (source < 0) return layout;
  const panes = layout.panes.map((pane, i) => {
    if (i !== source) return pane;
    const tabs = pane.tabs.filter((tab) => tab !== id);
    return {
      tabs,
      activeId: pane.activeId === id ? (tabs.at(-1) ?? null) : pane.activeId,
    };
  });
  return normalize(panes, panes[layout.focused]);
}

/** Keep only tabs whose repository still exists (server-side removals).
 * Returns the layout unchanged (same object) when nothing vanished, so
 * routine reloads do not churn downstream state. */
export function retainRepos(
  layout: PaneLayout,
  ids: Set<string>,
): PaneLayout {
  if (layout.panes.every((pane) => pane.tabs.every((tab) => ids.has(tab)))) {
    return layout;
  }
  const panes = layout.panes.map((pane) => {
    const tabs = pane.tabs.filter((tab) => ids.has(tab));
    return {
      tabs,
      activeId:
        pane.activeId !== null && ids.has(pane.activeId)
          ? pane.activeId
          : (tabs.at(-1) ?? null),
    };
  });
  return normalize(panes, panes[layout.focused]);
}

export function focusPane(layout: PaneLayout, index: number): PaneLayout {
  return {
    ...layout,
    focused: Math.max(0, Math.min(index, layout.panes.length - 1)),
  };
}

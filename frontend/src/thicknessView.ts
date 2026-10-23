import { type RowRange, START_TILT, type Tilt } from "./thicknessModel";

/** How the graph's thickness is seen: its tilt (ADR 0045) and the rows it
 * is drawn for (ADR 0044). */
export interface ThicknessViewState {
  tilt: Tilt;
  rows: RowRange;
}

/** A thickness view kept outside the card, so a drag or a scroll redraws
 * only the thickness and not every row of a long history. */
export interface ThicknessView {
  get(): ThicknessViewState;
  subscribe(listener: () => void): () => void;
  setTilt(tilt: Tilt): void;
  /** Rows equal to the current ones leave the state and listeners alone. */
  setRows(rows: RowRange): void;
}

export function createThicknessView(rows: RowRange): ThicknessView {
  let state: ThicknessViewState = { tilt: START_TILT, rows };
  const listeners = new Set<() => void>();
  const update = (next: ThicknessViewState) => {
    state = next;
    listeners.forEach((listener) => listener());
  };
  return {
    get: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setTilt: (tilt) => update({ ...state, tilt }),
    setRows(next) {
      if (next.first === state.rows.first && next.last === state.rows.last) {
        return;
      }
      update({ ...state, rows: next });
    },
  };
}

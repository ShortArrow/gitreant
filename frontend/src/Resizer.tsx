import { useState } from "react";

/** Clamp a panel width to its allowed range, rounded to whole pixels. */
export function clampWidth(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** A panel width persisted in localStorage under `key`. */
export function useStoredWidth(
  key: string,
  fallback: number,
  min: number,
  max: number,
): [number, (width: number) => void] {
  const [width, setWidth] = useState(() => {
    try {
      const stored = Number(localStorage.getItem(key));
      return Number.isFinite(stored) && stored > 0
        ? clampWidth(stored, min, max)
        : fallback;
    } catch {
      return fallback;
    }
  });
  const update = (value: number) => {
    const clamped = clampWidth(value, min, max);
    setWidth(clamped);
    try {
      localStorage.setItem(key, String(clamped));
    } catch {
      // localStorage may be unavailable; the state change alone is enough.
    }
  };
  return [width, update];
}

/**
 * A vertical drag handle sitting on a panel edge. While dragging, reports the
 * new width as `startWidth + direction * pointer travel`.
 */
export function ResizeHandle({
  width,
  onWidth,
  direction,
  label,
  testId,
}: {
  width: number;
  onWidth: (width: number) => void;
  /** 1 when dragging right grows the panel (left panel), -1 when dragging
   * left grows it (right panel). */
  direction: 1 | -1;
  label: string;
  testId: string;
}) {
  const startDrag = (down: React.PointerEvent<HTMLDivElement>) => {
    down.preventDefault();
    const handle = down.currentTarget;
    const startX = down.clientX;
    const startWidth = width;
    handle.setPointerCapture(down.pointerId);
    const move = (e: PointerEvent) =>
      onWidth(startWidth + direction * (e.clientX - startX));
    const stop = () => handle.removeEventListener("pointermove", move);
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", stop, { once: true });
    handle.addEventListener("pointercancel", stop, { once: true });
  };

  return (
    <div
      className="resize-handle"
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      data-testid={testId}
      onPointerDown={startDrag}
    />
  );
}

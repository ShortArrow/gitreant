import { useState } from "react";
import { pulledPath } from "./graph";

/**
 * A dashed auxiliary link (squash merge, stash internals, submodule pointer)
 * that can be grabbed and rubber-banded aside — its midpoint follows the
 * cursor while both endpoints stay anchored — to peek at whatever it crosses.
 * Releasing snaps it back to its normal path.
 *
 * A transparent 12px stroke on top makes the thin dashed line grabbable.
 */
export function DraggableDashed({
  d,
  x1,
  y1,
  x2,
  y2,
  stroke,
  strokeWidth,
  testId,
}: {
  /** The link's normal path, drawn whenever it is not being dragged. */
  d: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: string;
  strokeWidth: number;
  testId: string;
}) {
  const [pull, setPull] = useState<{ x: number; y: number } | null>(null);

  // Cursor position in the path's own coordinate space: getScreenCTM folds in
  // every ancestor transform (region/main-graph group offsets included).
  const localPoint = (e: React.PointerEvent<SVGPathElement>) => {
    const ctm = e.currentTarget.getScreenCTM();
    if (!ctm) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };

  const shown = pull ? pulledPath(x1, y1, x2, y2, pull.x, pull.y) : d;
  return (
    <>
      <path
        data-testid={testId}
        d={shown}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeDasharray="4 3"
        opacity={0.7}
      />
      <path
        data-testid={`${testId}-hit`}
        d={shown}
        fill="none"
        stroke="transparent"
        strokeWidth={12}
        style={{ cursor: pull ? "grabbing" : "grab", pointerEvents: "stroke" }}
        onPointerDown={(e) => {
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          const p = localPoint(e);
          if (p) setPull(p);
        }}
        onPointerMove={(e) => {
          if (!pull) return;
          const p = localPoint(e);
          if (p) setPull(p);
        }}
        onPointerUp={() => setPull(null)}
        onPointerCancel={() => setPull(null)}
      />
    </>
  );
}

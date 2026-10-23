/** A commit's lines added and deleted (ADR 0041). */
export interface LineStat {
  added: number;
  deleted: number;
}

export type Side = "added" | "deleted";

/** The screen direction a thickness of added lines extrudes in (ADR 0044):
 * up and to the left. Deleted lines extrude the opposite way. */
export const EXTRUDE = { x: -0.6, y: -0.8 };
/** Pixels of thickness each time a line count doubles. */
const SCALE = 3;
const MAX_THICKNESS = 36;
/** How far a thickness reaches sideways past its node. */
export const THICKNESS_REACH = Math.ceil(
  MAX_THICKNESS * Math.abs(EXTRUDE.x),
);
/** Pixels between the copies that build a thickness. */
const STEP = 2;

/** A thickness for a line count, on a logarithmic scale so a one-line fix
 * and a lockfile rewrite both stay readable, and capped so it stays near
 * its row. */
export function thickness(lines: number): number {
  return Math.min(MAX_THICKNESS, SCALE * Math.log2(1 + lines));
}

/** The distances of the copies that fill `length`: every STEP pixels,
 * ending at `length`. */
export function steps(length: number): number[] {
  const distances: number[] = [];
  for (let d = STEP; d < length; d += STEP) distances.push(d);
  if (length > 0) distances.push(length);
  return distances;
}

function direction(side: Side): { x: number; y: number } {
  return side === "added" ? EXTRUDE : { x: -EXTRUDE.x, y: -EXTRUDE.y };
}

function sideThickness(stat: LineStat | undefined, side: Side): number {
  return stat ? thickness(stat[side]) : 0;
}

/** One copy of a node behind it: moved by (`dx`, `dy`), `distance` from
 * it. */
export interface NodeLayer {
  kind: Side;
  dx: number;
  dy: number;
  distance: number;
}

/** The copies that give a node its thickness, far end first, so drawing
 * them in order and the node last leaves the node on top. */
export function nodeLayers(stat: LineStat | undefined): NodeLayer[] {
  return (["added", "deleted"] as const).flatMap((side) => {
    const length = sideThickness(stat, side);
    const v = direction(side);
    return steps(length)
      .reverse()
      .map((distance) => ({
        kind: side,
        dx: v.x * distance,
        dy: v.y * distance,
        distance,
      }));
  });
}

/** One copy of an edge behind it: its child's end moved by `from`, its
 * parent's by `to`. */
export interface EdgeLayer {
  kind: Side;
  from: { x: number; y: number };
  to: { x: number; y: number };
}

/** The copies that join the thickness of an edge's child to its parent's,
 * far end first. An edge whose child has no count yet stays flat. */
export function edgeLayers(
  child: LineStat | undefined,
  parent: LineStat | undefined,
): EdgeLayer[] {
  if (child === undefined) return [];
  return (["added", "deleted"] as const).flatMap((side) => {
    const near = sideThickness(child, side);
    const far = sideThickness(parent, side);
    const length = Math.max(near, far);
    const v = direction(side);
    return steps(length)
      .reverse()
      .map((distance) => {
        const f = distance / length;
        return {
          kind: side,
          from: { x: v.x * near * f, y: v.y * near * f },
          to: { x: v.x * far * f, y: v.y * far * f },
        };
      });
  });
}

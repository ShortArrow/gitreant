import { ROW_HEIGHT } from "./graph";

/** A commit's lines added and deleted (ADR 0041). */
export interface LineStat {
  added: number;
  deleted: number;
}

export type Side = "added" | "deleted";

/** How a thickness is tilted (ADR 0045): `angle` is the screen direction
 * added lines extrude in, in degrees clockwise from the right, and `depth`
 * scales it from 0 (seen from straight above) to 1. */
export interface Tilt {
  angle: number;
  depth: number;
}

/** The screen direction a thickness of added lines starts extruding in
 * (ADR 0044): up and to the left. Deleted lines extrude the opposite way. */
export const EXTRUDE = { x: -0.6, y: -0.8 };
export const START_TILT: Tilt = {
  angle: (Math.atan2(EXTRUDE.y, EXTRUDE.x) * 180) / Math.PI + 360,
  depth: 1,
};
/** Degrees the direction turns per pixel dragged sideways. */
const TURN_PER_PIXEL = 0.5;
/** Depth lost per pixel dragged down. */
const DEPTH_PER_PIXEL = 1 / 150;
/** Pixels of thickness each time a line count doubles. */
const SCALE = 3;
const MAX_THICKNESS = 36;
/** How far a thickness can reach past its node, turned any way. */
export const THICKNESS_REACH = MAX_THICKNESS;
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

/** `tilt` dragged by (`dx`, `dy`) pixels: sideways turns it, the whole way
 * round; up deepens it to 1 and down flattens it to 0. */
export function tiltBy(tilt: Tilt, dx: number, dy: number): Tilt {
  return {
    angle: (((tilt.angle + dx * TURN_PER_PIXEL) % 360) + 360) % 360,
    depth: Math.min(1, Math.max(0, tilt.depth - dy * DEPTH_PER_PIXEL)),
  };
}

/** The unit screen direction added lines extrude in under `tilt`. */
export function extrude(tilt: Tilt): { x: number; y: number } {
  const radians = (tilt.angle * Math.PI) / 180;
  return { x: Math.cos(radians), y: Math.sin(radians) };
}

function direction(side: Side, tilt: Tilt): { x: number; y: number } {
  const v = extrude(tilt);
  return side === "added" ? v : { x: -v.x, y: -v.y };
}

function sideThickness(
  stat: LineStat | undefined,
  side: Side,
  tilt: Tilt,
): number {
  return stat ? thickness(stat[side]) * tilt.depth : 0;
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
export function nodeLayers(
  stat: LineStat | undefined,
  tilt: Tilt = START_TILT,
): NodeLayer[] {
  return (["added", "deleted"] as const).flatMap((side) => {
    const length = sideThickness(stat, side, tilt);
    const v = direction(side, tilt);
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
  tilt: Tilt = START_TILT,
): EdgeLayer[] {
  if (child === undefined) return [];
  return (["added", "deleted"] as const).flatMap((side) => {
    const near = sideThickness(child, side, tilt);
    const far = sideThickness(parent, side, tilt);
    const length = Math.max(near, far);
    const v = direction(side, tilt);
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

/** The rows from `first` to `last`, both included. */
export interface RowRange {
  first: number;
  last: number;
}

/** The rows a thickness is drawn for when the pane is scrolled to
 * `scrollTop` and `viewHeight` tall: those in view, a screen either side
 * so a scroll shows no gap before the next draw, and the reach of a
 * thickness past that. */
export function rowsInView(scrollTop: number, viewHeight: number): RowRange {
  const margin = viewHeight + THICKNESS_REACH;
  return {
    first: Math.max(0, Math.floor((scrollTop - margin) / ROW_HEIGHT)),
    last: Math.ceil((scrollTop + viewHeight + margin) / ROW_HEIGHT),
  };
}

/** Whether an edge from `childRow` down to `parentRow` crosses `rows`. */
export function spansRows(
  childRow: number,
  parentRow: number,
  rows: RowRange,
): boolean {
  return childRow <= rows.last && parentRow >= rows.first;
}

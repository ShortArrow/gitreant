import type { CommitView, GraphEdge } from "./api";
import { nodeX, nodeY, PADDING, rowIndex, ROW_HEIGHT } from "./graph";

/** How the terrain is turned (ADR 0042), in degrees: `rotation` about the
 * vertical axis, then `tilt` back from looking straight down. */
export interface Orientation {
  rotation: number;
  tilt: number;
}

export const START: Orientation = { rotation: 30, tilt: 60 };
const MAX_TILT = 85;
const ROTATE_STEP = 15;
const TILT_STEP = 5;
/** Pixels a pillar grows each time its line count doubles. */
const PILLAR_SCALE = 8;

/** A point on the screen, with how near the viewer it stands. */
export interface Projected {
  x: number;
  y: number;
  depth: number;
}

/** A pillar's height for a line count, on a logarithmic scale so a
 * one-line fix and a lockfile rewrite both stay readable. */
export function pillarHeight(lines: number): number {
  return PILLAR_SCALE * Math.log2(1 + lines);
}

/** `orientation` turned by the given degrees; the rotation wraps around
 * and the tilt stays between straight down and nearly edge-on. */
export function turn(
  orientation: Orientation,
  rotation: number,
  tilt: number,
): Orientation {
  return {
    rotation: (((orientation.rotation + rotation) % 360) + 360) % 360,
    tilt: Math.min(MAX_TILT, Math.max(0, orientation.tilt + tilt)),
  };
}

/** The orientation a key turns the focused terrain to, or null for a key
 * the terrain does not take. */
export function terrainKey(
  key: string,
  orientation: Orientation,
): Orientation | null {
  switch (key) {
    case "ArrowLeft":
      return turn(orientation, -ROTATE_STEP, 0);
    case "ArrowRight":
      return turn(orientation, ROTATE_STEP, 0);
    case "ArrowUp":
      return turn(orientation, 0, TILT_STEP);
    case "ArrowDown":
      return turn(orientation, 0, -TILT_STEP);
    case "0":
      return START;
    default:
      return null;
  }
}

/** Project a point `z` above the ground at (`x`, `y`), relative to the
 * ground's center, straight onto the screen (orthographic). */
export function project(
  point: { x: number; y: number; z: number },
  { rotation, tilt }: Orientation,
): Projected {
  const r = (rotation * Math.PI) / 180;
  const t = (tilt * Math.PI) / 180;
  const x = point.x * Math.cos(r) - point.y * Math.sin(r);
  const depth = point.x * Math.sin(r) + point.y * Math.cos(r);
  return {
    x,
    y: depth * Math.cos(t) - point.z * Math.sin(t),
    depth,
  };
}

/** A commit placed on the terrain: its node on the ground and the tops of
 * its pillars, absent where it added or deleted nothing or is not counted. */
export interface TerrainCommit {
  commit: CommitView;
  node: Projected;
  up?: Projected;
  down?: Projected;
}

export interface TerrainEdge {
  edge: GraphEdge;
  points: Projected[];
}

export interface TerrainLayout {
  width: number;
  height: number;
  edges: TerrainEdge[];
  /** Back to front, the order to draw them in. */
  commits: TerrainCommit[];
}

/** The corners of an edge on the ground: the bends of the rows' graph
 * (see `edgePath`), joined straight. */
function edgeCorners(
  edge: GraphEdge,
  rowOf: Map<string, number>,
): [number, number][] | null {
  const childRow = rowOf.get(edge.from);
  const parentRow = rowOf.get(edge.to);
  if (childRow === undefined || parentRow === undefined) return null;
  const x1 = nodeX(edge.from_lane);
  const y1 = nodeY(childRow);
  const x2 = nodeX(edge.to_lane);
  const y2 = nodeY(parentRow);
  if (x1 !== x2) {
    if (edge.fork && y2 - ROW_HEIGHT > y1) {
      return [[x1, y1], [x1, y2 - ROW_HEIGHT], [x2, y2]];
    }
    if (!edge.fork && y1 + ROW_HEIGHT < y2) {
      return [[x1, y1], [x2, y1 + ROW_HEIGHT], [x2, y2]];
    }
  }
  return [[x1, y1], [x2, y2]];
}

function middle(values: number[]): number {
  return values.length === 0
    ? 0
    : (Math.min(...values) + Math.max(...values)) / 2;
}

/** Lay `commits` and `edges` out as terrain turned to `orientation`, moved
 * so every point sits inside `width` × `height` with a margin. */
export function terrainLayout(
  commits: CommitView[],
  edges: GraphEdge[],
  orientation: Orientation,
): TerrainLayout {
  const rowOf = rowIndex(commits);
  const cx = middle(commits.map((c) => nodeX(c.lane)));
  const cy = middle(commits.map((c) => nodeY(c.row)));
  const at = (x: number, y: number, z: number) =>
    project({ x: x - cx, y: y - cy, z }, orientation);

  const placed: TerrainCommit[] = commits.map((commit) => {
    const x = nodeX(commit.lane);
    const y = nodeY(commit.row);
    const { added = 0, deleted = 0 } = commit.stat ?? {};
    return {
      commit,
      node: at(x, y, 0),
      up: added > 0 ? at(x, y, pillarHeight(added)) : undefined,
      down: deleted > 0 ? at(x, y, -pillarHeight(deleted)) : undefined,
    };
  });
  const lines: TerrainEdge[] = edges.flatMap((edge) => {
    const corners = edgeCorners(edge, rowOf);
    return corners
      ? [{ edge, points: corners.map(([x, y]) => at(x, y, 0)) }]
      : [];
  });

  const points = [
    ...placed.flatMap((p) => [p.node, p.up, p.down]),
    ...lines.flatMap((l) => l.points),
  ].filter((p): p is Projected => p !== undefined);
  const minX = Math.min(...points.map((p) => p.x), 0);
  const minY = Math.min(...points.map((p) => p.y), 0);
  const maxX = Math.max(...points.map((p) => p.x), 0);
  const maxY = Math.max(...points.map((p) => p.y), 0);
  const shift = (p: Projected): Projected => ({
    x: p.x - minX + PADDING,
    y: p.y - minY + PADDING,
    depth: p.depth,
  });

  return {
    width: maxX - minX + PADDING * 2,
    height: maxY - minY + PADDING * 2,
    edges: lines.map((l) => ({ ...l, points: l.points.map(shift) })),
    commits: placed
      .map((p) => ({
        commit: p.commit,
        node: shift(p.node),
        up: p.up && shift(p.up),
        down: p.down && shift(p.down),
      }))
      .sort((a, b) => a.node.depth - b.node.depth),
  };
}

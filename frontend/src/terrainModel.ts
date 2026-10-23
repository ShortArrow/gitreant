import type { CommitView, GraphEdge } from "./api";
import { nodeX, nodeY, PADDING, rowIndex, ROW_HEIGHT } from "./graph";

/** How the terrain is turned (ADR 0042), in degrees: `rotation` about the
 * vertical axis, then `tilt` back from looking straight down. */
export interface Orientation {
  rotation: number;
  tilt: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Where the terrain is seen from: turned to its orientation about the
 * `pivot`, a point on the ground drawn at the viewport's center, and
 * scaled by `zoom`. */
export interface Camera extends Orientation {
  pivot: Point;
  zoom: number;
}

const START: Orientation = { rotation: 30, tilt: 60 };
const MAX_TILT = 85;
const ROTATE_STEP = 15;
const TILT_STEP = 5;
const ZOOM_STEP = 1.25;
const MIN_ZOOM = 0.02;
const MAX_ZOOM = 8;
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

/** `camera` turned by the given degrees; the rotation wraps around and the
 * tilt stays between straight down and nearly edge-on. */
export function turn<C extends Orientation>(
  camera: C,
  rotation: number,
  tilt: number,
): C {
  return {
    ...camera,
    rotation: (((camera.rotation + rotation) % 360) + 360) % 360,
    tilt: Math.min(MAX_TILT, Math.max(0, camera.tilt + tilt)),
  };
}

/** Project a point `z` above the ground at (`x`, `y`), relative to the
 * pivot, straight onto the screen (orthographic), unscaled. */
export function project(
  point: { x: number; y: number; z: number },
  { rotation, tilt }: Orientation,
): Projected {
  const r = radians(rotation);
  const t = radians(tilt);
  const x = point.x * Math.cos(r) - point.y * Math.sin(r);
  const depth = point.x * Math.sin(r) + point.y * Math.cos(r);
  return {
    x,
    y: depth * Math.cos(t) - point.z * Math.sin(t),
    depth,
  };
}

/** The ground offset that projects to the unscaled screen offset `screen`:
 * the inverse of [`project`] on the ground. */
function unproject(screen: Point, { rotation, tilt }: Orientation): Point {
  const r = radians(rotation);
  const x = screen.x;
  const depth = screen.y / Math.cos(radians(tilt));
  return {
    x: x * Math.cos(r) + depth * Math.sin(r),
    y: -x * Math.sin(r) + depth * Math.cos(r),
  };
}

function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** `camera` with the ground dragged by (`dx`, `dy`) screen pixels. */
export function pan(camera: Camera, dx: number, dy: number): Camera {
  const moved = unproject(
    { x: dx / camera.zoom, y: dy / camera.zoom },
    camera,
  );
  return {
    ...camera,
    pivot: { x: camera.pivot.x - moved.x, y: camera.pivot.y - moved.y },
  };
}

/** `camera` zoomed by `factor` about `at`, an offset from the viewport's
 * center, so the ground under it stays there. */
export function zoomAt(camera: Camera, factor: number, at: Point): Camera {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, camera.zoom * factor));
  const ratio = 1 / camera.zoom - 1 / zoom;
  const moved = unproject({ x: at.x * ratio, y: at.y * ratio }, camera);
  return {
    ...camera,
    zoom,
    pivot: { x: camera.pivot.x + moved.x, y: camera.pivot.y + moved.y },
  };
}

/** The camera a terrain opens with: turned to the starting orientation
 * about the middle of `commits`, zoomed out until all of them fit
 * `viewport`, and never in past their natural size. */
export function startCamera(
  commits: CommitView[],
  viewport: { width: number; height: number },
): Camera {
  const pivot = {
    x: middle(commits.map((c) => nodeX(c.lane))),
    y: middle(commits.map((c) => nodeY(c.row))),
  };
  const unscaled = terrainLayout(commits, [], { ...START, pivot, zoom: 1 });
  const points = unscaled.commits.flatMap((c) =>
    [c.node, c.up, c.down].flatMap((p) => (p ? [p] : [])),
  );
  const reach = (axis: "x" | "y") =>
    Math.max(1, ...points.map((p) => Math.abs(p[axis])));
  const zoom = Math.min(
    (viewport.width / 2 - PADDING) / reach("x"),
    (viewport.height / 2 - PADDING) / reach("y"),
  );
  return { ...START, pivot, zoom: Math.min(1, Math.max(MIN_ZOOM, zoom)) };
}

/** The camera a key moves the focused terrain to, or null for a key the
 * terrain does not take; `0` returns to `start`. */
export function terrainKey(
  key: string,
  camera: Camera,
  start: Camera,
): Camera | null {
  switch (key) {
    case "ArrowLeft":
      return turn(camera, -ROTATE_STEP, 0);
    case "ArrowRight":
      return turn(camera, ROTATE_STEP, 0);
    case "ArrowUp":
      return turn(camera, 0, TILT_STEP);
    case "ArrowDown":
      return turn(camera, 0, -TILT_STEP);
    case "+":
    case "=":
      return zoomAt(camera, ZOOM_STEP, { x: 0, y: 0 });
    case "-":
      return zoomAt(camera, 1 / ZOOM_STEP, { x: 0, y: 0 });
    case "0":
      return start;
    default:
      return null;
  }
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

/** Lay `commits` and `edges` out as terrain seen by `camera`, in screen
 * pixels from the viewport's center. */
export function terrainLayout(
  commits: CommitView[],
  edges: GraphEdge[],
  camera: Camera,
): TerrainLayout {
  const rowOf = rowIndex(commits);
  const at = (x: number, y: number, z: number): Projected => {
    const p = project(
      { x: x - camera.pivot.x, y: y - camera.pivot.y, z },
      camera,
    );
    return { x: p.x * camera.zoom, y: p.y * camera.zoom, depth: p.depth };
  };

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

  return {
    edges: lines,
    commits: placed.sort((a, b) => a.node.depth - b.node.depth),
  };
}

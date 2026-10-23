import { expect, test } from "vitest";
import type { GraphEdge } from "./api";
import { edgeBetween, edgePath, nodeX, nodeY } from "./graph";
import {
  EXTRUDE,
  extrude,
  START_TILT,
  tiltBy,
  edgeLayers,
  nodeLayers,
  steps,
  thickness,
  THICKNESS_REACH,
} from "./thicknessModel";

test("thickness grows by the logarithm of the lines, up to a cap", () => {
  expect(thickness(0)).toBe(0);
  expect(thickness(1)).toBe(3);
  expect(thickness(3)).toBe(6);
  expect(thickness(1_000_000)).toBe(36);
});

test("added lines start extruding up and to the left", () => {
  expect(EXTRUDE.x).toBeLessThan(0);
  expect(EXTRUDE.y).toBeLessThan(0);
  expect(Math.hypot(EXTRUDE.x, EXTRUDE.y)).toBeCloseTo(1);
  expect(extrude(START_TILT).x).toBeCloseTo(EXTRUDE.x);
  expect(extrude(START_TILT).y).toBeCloseTo(EXTRUDE.y);
  expect(START_TILT.depth).toBe(1);
});

test("the reach covers a thickness turned any way", () => {
  expect(THICKNESS_REACH).toBeGreaterThanOrEqual(thickness(1_000_000));
});

test("dragging turns the direction and changes the depth", () => {
  const turned = tiltBy(START_TILT, 20, 0);
  expect(turned.angle).toBeCloseTo(START_TILT.angle + 10);
  expect(turned.depth).toBe(1);
  // Up deepens, but no deeper than the start; down flattens to nothing.
  expect(tiltBy(START_TILT, 0, -100).depth).toBe(1);
  expect(tiltBy(START_TILT, 0, 75).depth).toBeCloseTo(0.5);
  expect(tiltBy(START_TILT, 0, 1000).depth).toBe(0);
  expect(tiltBy({ angle: 350, depth: 1 }, 40, 0).angle).toBeCloseTo(10);
  expect(tiltBy({ angle: 10, depth: 1 }, -40, 0).angle).toBeCloseTo(350);
});

test("a tilt turns and scales the copies", () => {
  const right = { angle: 0, depth: 0.5 };
  // 3 lines added is 6 thick; half deep, 3.
  const layers = nodeLayers({ added: 3, deleted: 3 }, right);
  const added = layers.filter((l) => l.kind === "added");
  const deleted = layers.filter((l) => l.kind === "deleted");
  expect(added.map((l) => l.distance)).toEqual([3, 2]);
  expect(added[0].dx).toBeCloseTo(3);
  expect(added[0].dy).toBeCloseTo(0);
  expect(deleted[0].dx).toBeCloseTo(-3);
  expect(nodeLayers({ added: 3, deleted: 3 }, { angle: 0, depth: 0 })).toEqual(
    [],
  );
  const fins = edgeLayers(
    { added: 3, deleted: 0 },
    { added: 1, deleted: 0 },
    right,
  );
  expect(fins[0].from.x).toBeCloseTo(3);
  expect(fins[0].to.x).toBeCloseTo(1.5);
});

test("steps fill a length every two pixels, ending at it", () => {
  expect(steps(0)).toEqual([]);
  expect(steps(5)).toEqual([2, 4, 5]);
  expect(steps(4)).toEqual([2, 4]);
});

test("added lines raise a node, deleted lines sink it, far end first", () => {
  const layers = nodeLayers({ added: 1, deleted: 3 });
  const added = layers.filter((l) => l.kind === "added");
  const deleted = layers.filter((l) => l.kind === "deleted");
  expect(added.map((l) => l.distance)).toEqual([3, 2]);
  expect(deleted.map((l) => l.distance)).toEqual([6, 4, 2]);
  expect(added[0].dx).toBeCloseTo(3 * EXTRUDE.x);
  expect(added[0].dy).toBeCloseTo(3 * EXTRUDE.y);
  expect(deleted[0].dx).toBeCloseTo(-6 * EXTRUDE.x);
  expect(deleted[0].dy).toBeCloseTo(-6 * EXTRUDE.y);
  expect(nodeLayers(undefined)).toEqual([]);
  expect(nodeLayers({ added: 0, deleted: 0 })).toEqual([]);
});

test("an edge's copies join each end's thickness, far end first", () => {
  const layers = edgeLayers({ added: 3, deleted: 0 }, { added: 1, deleted: 0 });
  // The child is 6 thick, the parent 3: three steps reach the child's 6.
  expect(layers.map((l) => l.kind)).toEqual(["added", "added", "added"]);
  const far = layers[0];
  expect(far.from.x).toBeCloseTo(6 * EXTRUDE.x);
  expect(far.to.y).toBeCloseTo(3 * EXTRUDE.y);
  const near = layers[2];
  expect(near.from.x).toBeCloseTo(2 * EXTRUDE.x);
  expect(near.to.x).toBeCloseTo(1 * EXTRUDE.x);
  expect(edgeLayers(undefined, { added: 9, deleted: 9 })).toEqual([]);
});

test("an edge between two points bends as the rows' graph does", () => {
  const edge: GraphEdge = {
    from: "c",
    to: "p",
    from_lane: 0,
    to_lane: 1,
    color: 0,
    fork: true,
  };
  expect(edgeBetween(edge, { x: 10, y: 20 }, { x: 28, y: 84 })).toBe(
    "M10,20 L10,52 C10,68 28,68 28,84",
  );
  const rowOf = new Map([
    ["c", 0],
    ["p", 3],
  ]);
  expect(edgePath(edge, rowOf)).toBe(
    edgeBetween(
      edge,
      { x: nodeX(0), y: nodeY(0) },
      { x: nodeX(1), y: nodeY(3) },
    ),
  );
});

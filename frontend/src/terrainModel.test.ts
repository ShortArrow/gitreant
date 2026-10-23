import { expect, test } from "vitest";
import type { CommitView, GraphEdge } from "./api";
import {
  type Camera,
  commitGround,
  grip,
  groundAt,
  pan,
  pillarHeight,
  project,
  startCamera,
  terrainKey,
  terrainLayout,
  turn,
  zoomAt,
} from "./terrainModel";

function commit(
  id: string,
  row: number,
  lane: number,
  stat?: { added: number; deleted: number },
): CommitView {
  return {
    id,
    row,
    lane,
    color: lane,
    parents: [],
    summary: id,
    author: "a",
    time: 0,
    stat,
  };
}

const camera: Camera = {
  rotation: 30,
  tilt: 60,
  pivot: { x: 20, y: 40 },
  anchor: { x: 7, y: -11 },
  zoom: 2,
};

function screenOf(commits: CommitView[], at: Camera, id: string) {
  const placed = terrainLayout(commits, [], at).commits.find(
    (c) => c.commit.id === id,
  )!;
  return placed.node;
}

test("a pillar grows by the logarithm of its lines", () => {
  expect(pillarHeight(0)).toBe(0);
  expect(pillarHeight(1)).toBe(8);
  expect(pillarHeight(3)).toBe(16);
  expect(pillarHeight(1023)).toBe(80);
});

test("from above and unturned, the ground projects as it lies", () => {
  const flat = { rotation: 0, tilt: 0 };
  expect(project({ x: 5, y: -3, z: 40 }, flat)).toEqual({
    x: 5,
    y: -3,
    depth: -3,
  });
});

test("tilting raises a height up the screen", () => {
  const p = project({ x: 0, y: 0, z: 10 }, { rotation: 0, tilt: 30 });
  expect(p.x).toBeCloseTo(0);
  expect(p.y).toBeCloseTo(-5);
  const ground = project({ x: 0, y: 10, z: 0 }, { rotation: 0, tilt: 60 });
  expect(ground.y).toBeCloseTo(5);
  expect(ground.depth).toBeCloseTo(10);
});

test("rotating turns the ground about the vertical axis", () => {
  const p = project({ x: 1, y: 0, z: 0 }, { rotation: 90, tilt: 0 });
  expect(p.x).toBeCloseTo(0);
  expect(p.y).toBeCloseTo(1);
});

test("a turn keeps the tilt between above and nearly edge-on", () => {
  expect(turn(camera, 0, -100).tilt).toBe(0);
  expect(turn(camera, 0, 100).tilt).toBe(85);
  expect(turn({ ...camera, rotation: 350 }, 20, 0).rotation).toBe(10);
  expect(turn({ ...camera, rotation: 10 }, -20, 0).rotation).toBe(350);
  expect(turn(camera, 15, 5)).toMatchObject({
    pivot: camera.pivot,
    zoom: camera.zoom,
  });
});

test("the pivot stays put at its anchor while the terrain turns", () => {
  const commits = [commit("a", 0, 0), commit("b", 5, 3)];
  const on = { ...camera, pivot: { x: 14, y: 16 } };
  for (const turned of [on, turn(on, 45, 0), turn(on, 0, -30)]) {
    const a = screenOf(commits, turned, "a");
    expect(a.x).toBeCloseTo(camera.anchor.x);
    expect(a.y).toBeCloseTo(camera.anchor.y);
  }
});

test("gripping a ground point moves nothing, then turns about it", () => {
  const commits = [commit("a", 0, 0), commit("b", 5, 3), commit("c", 9, 1)];
  const gripped = grip(camera, commitGround(commits[1]));
  for (const id of ["a", "b", "c"]) {
    const before = screenOf(commits, camera, id);
    const after = screenOf(commits, gripped, id);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  }
  const b = screenOf(commits, gripped, "b");
  for (const turned of [turn(gripped, 70, 0), turn(gripped, -20, 15)]) {
    const after = screenOf(commits, turned, "b");
    expect(after.x).toBeCloseTo(b.x);
    expect(after.y).toBeCloseTo(b.y);
  }
});

test("the ground under a screen point is the one drawn there", () => {
  const commits = [commit("a", 0, 0), commit("b", 4, 2)];
  const b = screenOf(commits, camera, "b");
  const ground = groundAt(camera, b);
  expect(ground.x).toBeCloseTo(commitGround(commits[1]).x);
  expect(ground.y).toBeCloseTo(commitGround(commits[1]).y);
});

test("panning moves the terrain with the pointer", () => {
  const commits = [commit("a", 0, 0), commit("b", 3, 2)];
  const before = screenOf(commits, camera, "b");
  const after = screenOf(commits, pan(camera, 30, -12), "b");
  expect(after.x - before.x).toBeCloseTo(30);
  expect(after.y - before.y).toBeCloseTo(-12);
});

test("zooming keeps the point under the pointer in place", () => {
  const commits = [commit("a", 0, 0), commit("b", 3, 2)];
  const b = screenOf(commits, camera, "b");
  const zoomed = zoomAt(camera, 1.5, b);
  expect(zoomed.zoom).toBeCloseTo(3);
  const after = screenOf(commits, zoomed, "b");
  expect(after.x).toBeCloseTo(b.x);
  expect(after.y).toBeCloseTo(b.y);
  expect(zoomAt(camera, 1e6, b).zoom).toBe(8);
  expect(zoomAt(camera, 1e-6, b).zoom).toBe(0.02);
});

test("the start fits every commit and pillar into the viewport", () => {
  const commits = Array.from({ length: 400 }, (_, row) =>
    commit(`c${row}`, row, row % 4, { added: row * 10, deleted: row }),
  );
  const viewport = { width: 600, height: 400 };
  const start = startCamera(commits, viewport);
  expect(start).toMatchObject({
    rotation: 30,
    tilt: 60,
    anchor: { x: 0, y: 0 },
  });
  const layout = terrainLayout(commits, [], start);
  const points = layout.commits.flatMap((c) =>
    [c.node, c.up, c.down].flatMap((p) => (p ? [p] : [])),
  );
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  expect(Math.min(...xs)).toBeGreaterThanOrEqual(-300);
  expect(Math.max(...xs)).toBeLessThanOrEqual(300);
  expect(Math.min(...ys)).toBeGreaterThanOrEqual(-200);
  expect(Math.max(...ys)).toBeLessThanOrEqual(200);
  // Fitted, not merely inside: one side spans most of the viewport.
  expect(
    Math.max(
      (Math.max(...xs) - Math.min(...xs)) / 600,
      (Math.max(...ys) - Math.min(...ys)) / 400,
    ),
  ).toBeGreaterThan(0.8);
});

test("a history that already fits opens at its natural size", () => {
  const small = [commit("a", 0, 0), commit("b", 1, 0)];
  expect(startCamera(small, { width: 600, height: 400 }).zoom).toBe(1);
});

test("the keys turn, tilt, zoom and reset the terrain", () => {
  const start = { ...camera, zoom: 1 };
  expect(terrainKey("ArrowLeft", camera, start)).toEqual(turn(camera, -15, 0));
  expect(terrainKey("ArrowRight", camera, start)).toEqual(turn(camera, 15, 0));
  expect(terrainKey("ArrowUp", camera, start)).toEqual(turn(camera, 0, 5));
  expect(terrainKey("ArrowDown", camera, start)).toEqual(turn(camera, 0, -5));
  expect(terrainKey("+", camera, start)?.zoom).toBeCloseTo(2.5);
  expect(terrainKey("=", camera, start)?.zoom).toBeCloseTo(2.5);
  expect(terrainKey("-", camera, start)?.zoom).toBeCloseTo(1.6);
  expect(terrainKey("0", camera, start)).toEqual(start);
  expect(terrainKey("x", camera, start)).toBeNull();
});

test("the layout draws pillars from back to front", () => {
  const commits = [
    commit("a", 0, 0, { added: 7, deleted: 0 }),
    commit("b", 1, 1, { added: 0, deleted: 3 }),
    commit("c", 2, 0),
    commit("d", 3, 0),
  ];
  const edges: GraphEdge[] = [
    { from: "a", to: "c", from_lane: 0, to_lane: 0, color: 0, fork: false },
    { from: "b", to: "d", from_lane: 1, to_lane: 0, color: 1, fork: true },
    { from: "c", to: "gone", from_lane: 0, to_lane: 0, color: 0, fork: false },
  ];
  const flat = { ...camera, rotation: 0 };
  const layout = terrainLayout(commits, edges, flat);

  expect(layout.commits.map((c) => c.commit.id)).toEqual(["a", "b", "c", "d"]);
  const [a, b, c] = layout.commits;
  expect(a.up && a.up.y).toBeLessThan(a.node.y);
  expect(a.down).toBeUndefined();
  expect(b.up).toBeUndefined();
  expect(b.down && b.down.y).toBeGreaterThan(b.node.y);
  expect(c.up).toBeUndefined();
  expect(c.down).toBeUndefined();

  expect(layout.edges).toHaveLength(2);
  expect(layout.edges[1].points).toHaveLength(3);

  const back = terrainLayout(commits, [], { ...flat, rotation: 180 });
  expect(back.commits.map((c) => c.commit.id)).toEqual(["d", "c", "b", "a"]);
});

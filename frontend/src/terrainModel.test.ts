import { expect, test } from "vitest";
import type { CommitView, GraphEdge } from "./api";
import {
  pillarHeight,
  project,
  START,
  terrainKey,
  terrainLayout,
  turn,
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
  expect(turn(START, 0, -100).tilt).toBe(0);
  expect(turn(START, 0, 100).tilt).toBe(85);
  expect(turn({ rotation: 350, tilt: 10 }, 20, 0).rotation).toBe(10);
  expect(turn({ rotation: 10, tilt: 10 }, -20, 0).rotation).toBe(350);
});

test("the keys turn, tilt and reset the terrain", () => {
  expect(terrainKey("ArrowLeft", START)).toEqual(turn(START, -15, 0));
  expect(terrainKey("ArrowRight", START)).toEqual(turn(START, 15, 0));
  expect(terrainKey("ArrowUp", START)).toEqual(turn(START, 0, 5));
  expect(terrainKey("ArrowDown", START)).toEqual(turn(START, 0, -5));
  expect(terrainKey("0", { rotation: 100, tilt: 20 })).toEqual(START);
  expect(terrainKey("x", START)).toBeNull();
});

test("the layout draws pillars from back to front, within its bounds", () => {
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
  const layout = terrainLayout(commits, edges, { rotation: 0, tilt: 60 });

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
  const ys = layout.commits.flatMap((p) =>
    [p.node, p.up, p.down].flatMap((q) => (q ? [q.y] : [])),
  );
  expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
  expect(Math.max(...ys)).toBeLessThanOrEqual(layout.height);
});

test("turned around, the last row is drawn first", () => {
  const commits = [commit("a", 0, 0), commit("b", 1, 0)];
  const layout = terrainLayout(commits, [], { rotation: 180, tilt: 60 });
  expect(layout.commits.map((c) => c.commit.id)).toEqual(["b", "a"]);
});

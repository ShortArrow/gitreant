import { expect, test } from "vitest";
import { START_TILT } from "./thicknessModel";
import { createThicknessView } from "./thicknessView";

test("a thickness view tells its listeners what changed", () => {
  const view = createThicknessView({ first: 0, last: 10 });
  expect(view.get()).toEqual({
    tilt: START_TILT,
    rows: { first: 0, last: 10 },
  });
  let heard = 0;
  const stop = view.subscribe(() => heard++);

  view.setTilt({ angle: 0, depth: 0.5 });
  expect(view.get().tilt).toEqual({ angle: 0, depth: 0.5 });
  expect(heard).toBe(1);

  view.setRows({ first: 5, last: 15 });
  expect(view.get().rows).toEqual({ first: 5, last: 15 });
  expect(heard).toBe(2);

  stop();
  view.setTilt(START_TILT);
  expect(heard).toBe(2);
});

test("the same rows again change nothing", () => {
  const view = createThicknessView({ first: 0, last: 10 });
  const before = view.get();
  let heard = 0;
  view.subscribe(() => heard++);
  view.setRows({ first: 0, last: 10 });
  expect(view.get()).toBe(before);
  expect(heard).toBe(0);
});

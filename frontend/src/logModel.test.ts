import { expect, test } from "vitest";
import { mergeLog } from "./logModel";

test("merges server commands and user actions sorted by time", () => {
  const items = mergeLog(
    [
      { time: 10, repo: "a", command: "git fetch", ok: true, message: "" },
      { time: 30, repo: "a", command: "git pull", ok: false, message: "boom" },
    ],
    [
      { time: 20, text: "Reload repositories" },
      { time: 5, text: "Fetch remotes" },
    ],
  );

  expect(items.map((i) => [i.time, i.kind, i.text])).toEqual([
    [5, "action", "Fetch remotes"],
    [10, "command", "git fetch"],
    [20, "action", "Reload repositories"],
    [30, "command", "git pull"],
  ]);
});

test("keeps command failures marked and actions always ok", () => {
  const items = mergeLog(
    [{ time: 1, repo: "a", command: "git x", ok: false, message: "bad" }],
    [{ time: 2, text: "Fetch remotes" }],
  );

  expect(items[0]).toMatchObject({ ok: false, message: "bad" });
  expect(items[1]).toMatchObject({ ok: true });
});

test("orders the triggering action before its command on a time tie", () => {
  const items = mergeLog(
    [{ time: 7, repo: "a", command: "git fetch", ok: true, message: "" }],
    [{ time: 7, text: "Fetch remotes" }],
  );

  expect(items.map((i) => i.kind)).toEqual(["action", "command"]);
});

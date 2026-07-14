import { expect, test } from "vitest";
import { filterCommands, type PaletteCommand } from "./palette";

const command = (id: string, title: string): PaletteCommand => ({
  id,
  title,
  run: () => {},
});

const commands = [
  command("fetch", "Fetch remotes"),
  command("reload", "Reload repositories"),
  command("open-a", "Open repository: repoA"),
  command("open-b", "Open repository: repoB"),
];

test("an empty query keeps every command in order", () => {
  expect(filterCommands(commands, "")).toEqual(commands);
});

test("filters case-insensitively by substring", () => {
  expect(filterCommands(commands, "REPOB").map((c) => c.id)).toEqual([
    "open-b",
  ]);
  expect(filterCommands(commands, "xyz")).toEqual([]);
});

test("prefix matches rank before mid-string matches", () => {
  expect(filterCommands(commands, "re").map((c) => c.id)).toEqual([
    "reload",
    "fetch",
    "open-a",
    "open-b",
  ]);
});

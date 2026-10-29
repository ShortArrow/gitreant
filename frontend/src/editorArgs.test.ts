import { expect, test } from "vitest";
import { formatArgs } from "./editorArgs";

test("formatArgs quotes the parts that have a space", () => {
  expect(
    formatArgs(["C:/Program Files/x.exe", "--goto", "{path}:{line}"]),
  ).toBe('"C:/Program Files/x.exe" --goto {path}:{line}');
  expect(formatArgs([])).toBe("");
});

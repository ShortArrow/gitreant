import { expect, test } from "vitest";
import { formatArgs, parseArgs } from "./editorArgs";

test("parseArgs splits on spaces and keeps quoted spaces", () => {
  expect(parseArgs("--goto {path}:{line}")).toEqual([
    "--goto",
    "{path}:{line}",
  ]);
  expect(parseArgs(' -n  "C:/Program Files/x" ')).toEqual([
    "-n",
    "C:/Program Files/x",
  ]);
  expect(parseArgs("")).toEqual([]);
});

test("formatArgs quotes what has a space, so parseArgs reads it back", () => {
  const args = ["--goto", "{path}:{line}", "a b"];
  expect(formatArgs(args)).toBe('--goto {path}:{line} "a b"');
  expect(parseArgs(formatArgs(args))).toEqual(args);
});

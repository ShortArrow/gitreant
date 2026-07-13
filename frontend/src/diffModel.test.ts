import { expect, test } from "vitest";
import { parseUnified } from "./diffModel";

test("pairs runs of removals and additions row by row", () => {
  const hunks = parseUnified("@@ -1,3 +1,2 @@\n ctx\n-a\n-b\n+A\n");

  expect(hunks).toHaveLength(1);
  const rows = hunks[0].rows;
  expect(rows).toHaveLength(3);
  expect(rows[0].left).toMatchObject({ no: 1, text: "ctx", kind: "context" });
  expect(rows[0].right).toMatchObject({ no: 1, text: "ctx", kind: "context" });
  expect(rows[1].left).toMatchObject({ no: 2, text: "a", kind: "remove" });
  expect(rows[1].right).toMatchObject({ no: 2, text: "A", kind: "add" });
  // The second removal has no addition to pair with.
  expect(rows[2].left).toMatchObject({ no: 3, text: "b", kind: "remove" });
  expect(rows[2].right).toBeUndefined();
});

test("tracks line numbers across multiple hunks", () => {
  const hunks = parseUnified(
    "@@ -1 +1,2 @@\n one\n+two\n@@ -10,2 +11,2 @@\n-x\n+y\n z\n",
  );

  expect(hunks).toHaveLength(2);
  // A header without an explicit count ("-1") still parses.
  expect(hunks[0].rows[1].left).toBeUndefined();
  expect(hunks[0].rows[1].right).toMatchObject({ no: 2, text: "two" });
  expect(hunks[1].rows[0].left).toMatchObject({ no: 10, text: "x" });
  expect(hunks[1].rows[0].right).toMatchObject({ no: 11, text: "y" });
  expect(hunks[1].rows[1].left).toMatchObject({ no: 11, text: "z" });
  expect(hunks[1].rows[1].right).toMatchObject({ no: 12, text: "z" });
});

test("handles empty input and text without a trailing newline", () => {
  expect(parseUnified("")).toEqual([]);
  const hunks = parseUnified("@@ -1 +1 @@\n-a\n+b");
  expect(hunks[0].rows).toHaveLength(1);
  expect(hunks[0].rows[0].right).toMatchObject({ text: "b" });
});

import { expect, test } from "vitest";
import {
  inlineCells,
  intralineSegments,
  parseUnified,
  permalinkFragment,
  selectedLines,
} from "./diffModel";

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

test("splits an edited line into unchanged and changed segments", () => {
  const pair = intralineSegments("foo(a, b)", "foo(a, c, b)");

  expect(pair).not.toBeNull();
  // The removal side has nothing inserted, so only the shared affixes remain.
  expect(pair!.old).toEqual([
    { text: "foo(a, ", changed: false },
    { text: "b)", changed: false },
  ]);
  expect(pair!.new).toEqual([
    { text: "foo(a, ", changed: false },
    { text: "c, ", changed: true },
    { text: "b)", changed: false },
  ]);
});

test("marks the differing middle on both sides", () => {
  const pair = intralineSegments("let x = 1;", "let x = 42;");

  expect(pair!.old).toEqual([
    { text: "let x = ", changed: false },
    { text: "1", changed: true },
    { text: ";", changed: false },
  ]);
  expect(pair!.new).toEqual([
    { text: "let x = ", changed: false },
    { text: "42", changed: true },
    { text: ";", changed: false },
  ]);
});

test("does not double-count overlapping prefix and suffix", () => {
  const pair = intralineSegments("aaa", "aa");

  expect(pair!.old).toEqual([
    { text: "aa", changed: false },
    { text: "a", changed: true },
  ]);
  expect(pair!.new).toEqual([{ text: "aa", changed: false }]);
});

test("returns null when the lines share nothing at either end", () => {
  expect(intralineSegments("abc", "xyz")).toBeNull();
  expect(intralineSegments("", "added")).toBeNull();
});

test("flattens rows back into unified order for the inline view", () => {
  const hunks = parseUnified("@@ -1,3 +1,2 @@\n-a\n-b\n+A\n ctx\n");

  const cells = inlineCells(hunks[0].rows);
  expect(cells.map((c) => [c.kind, c.text])).toEqual([
    ["remove", "a"],
    ["remove", "b"],
    ["add", "A"],
    ["context", "ctx"],
  ]);
});

test("inline context lines carry the new-side line number", () => {
  // Old line 3 is new line 5; permalinks address the new side.
  const hunks = parseUnified("@@ -3 +5 @@\n x\n");
  expect(inlineCells(hunks[0].rows)[0].no).toBe(5);
});

test("selectedLines joins the selected cells' text", () => {
  const hunks = parseUnified("@@ -1,2 +1,2 @@\n ctx\n-old\n+new\n");
  const cells = inlineCells(hunks[0].rows);
  expect(selectedLines(cells)).toBe("ctx\nold\nnew");
});

test("permalinkFragment uses new-side line numbers", () => {
  const hunks = parseUnified("@@ -3,3 +3,3 @@\n a\n b\n c\n");
  const cells = inlineCells(hunks[0].rows);
  expect(permalinkFragment(cells)).toBe("#L3-L5");
  expect(permalinkFragment(cells.slice(0, 1))).toBe("#L3");
});

test("permalinkFragment refuses removed lines and empty selections", () => {
  const hunks = parseUnified("@@ -1,2 +1,1 @@\n keep\n-gone\n");
  const cells = inlineCells(hunks[0].rows);
  expect(permalinkFragment(cells)).toBeNull();
  expect(permalinkFragment([])).toBeNull();
});

test("attaches segments to paired remove/add rows only", () => {
  const hunks = parseUnified(
    "@@ -1,3 +1,3 @@\n-foo(a, b)\n+foo(a, c, b)\n ctx\n-lonely\n",
  );

  const paired = hunks[0].rows[0];
  expect(paired.left!.segments).toBeDefined();
  expect(paired.right!.segments).toContainEqual({ text: "c, ", changed: true });

  const context = hunks[0].rows[1];
  expect(context.left!.segments).toBeUndefined();

  const lonely = hunks[0].rows[2];
  expect(lonely.left!.segments).toBeUndefined();
});

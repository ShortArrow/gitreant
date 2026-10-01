import { expect, test } from "vitest";
import {
  eolChange,
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

test("permalinkFragment addresses the old side with old-side rules", () => {
  // The extra addition pairs with nothing: its row has no old side.
  const hunks = parseUnified("@@ -3,2 +5,3 @@\n both\n-gone\n+added\n+extra\n");
  const left = hunks[0].rows.map((r) => r.left);

  // Old side: context (old no 3) + removal (old no 4) both exist there.
  expect(permalinkFragment(left.slice(0, 2), "old")).toBe("#L3-L4");
  // A row missing on the old side breaks the permalink.
  expect(permalinkFragment(left, "old")).toBeNull();
});

test("selectedLines skips rows missing on the chosen side", () => {
  const hunks = parseUnified("@@ -1,2 +1,1 @@\n keep\n-gone\n");
  const left = hunks[0].rows.map((r) => r.left);
  const right = hunks[0].rows.map((r) => r.right);
  expect(selectedLines(left)).toBe("keep\ngone");
  expect(selectedLines(right)).toBe("keep");
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

test("a line whose only change is its line ending names both endings", () => {
  // git prints a CR-terminated line with the CR still on it; the cell keeps
  // its text clean and records the ending instead.
  const [hunk] = parseUnified("@@ -1,2 +1,2 @@\n-one\n-two\n+one\r\n+two\r\n");
  const [first] = hunk.rows;
  expect(first.left).toMatchObject({ text: "one", kind: "remove", eol: "LF" });
  expect(first.right).toMatchObject({ text: "one", kind: "add", eol: "CRLF" });
  // Nothing in the text itself changed.
  expect(first.right?.segments?.some((s) => s.changed) ?? false).toBe(false);
});

test("a content edit that also changes the ending keeps both marks", () => {
  const [hunk] = parseUnified("@@ -1 +1 @@\n-one\n+onE\r\n");
  const [row] = hunk.rows;
  expect(row.right?.eol).toBe("CRLF");
  expect(row.right?.segments).toEqual([
    { text: "on", changed: false },
    { text: "E", changed: true },
  ]);
});

test("unpaired and context lines carry no ending mark and no CR", () => {
  const [hunk] = parseUnified("@@ -1,1 +1,2 @@\n ctx\r\n+added\r\n");
  const [context, added] = hunk.rows;
  expect(context.right).toEqual({ no: 1, text: "ctx", kind: "context" });
  expect(added.right).toEqual({ no: 2, text: "added", kind: "add" });
});

test("copied lines never include a carriage return", () => {
  const [hunk] = parseUnified("@@ -1 +1 @@\n-one\n+one\r\n");
  expect(selectedLines([hunk.rows[0].right])).toBe("one");
});

test("eolChange names a whole-file conversion and nothing else", () => {
  const toCrlf = parseUnified("@@ -1,2 +1,2 @@\n-a\n-b\n+a\r\n+b\r\n");
  expect(eolChange(toCrlf)).toEqual({ from: "LF", to: "CRLF" });
  const toLf = parseUnified("@@ -1 +1 @@\n-a\r\n+a\n");
  expect(eolChange(toLf)).toEqual({ from: "CRLF", to: "LF" });
  // A content change, an added line, or no change at all is not a
  // line-ending conversion.
  expect(eolChange(parseUnified("@@ -1 +1 @@\n-a\n+b\r\n"))).toBeNull();
  expect(eolChange(parseUnified("@@ -1 +1,2 @@\n-a\n+a\r\n+c\r\n"))).toBeNull();
  expect(eolChange(parseUnified(""))).toBeNull();
});

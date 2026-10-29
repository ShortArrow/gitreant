import { describe, expect, test } from "vitest";
import {
  diffBlocks,
  diffCounts,
  eolChange,
  inlineCells,
  intralineSegments,
  markdownLink,
  parseUnified,
  permalinkFragment,
  selectedLines,
  typstLink,
  type DiffBlock,
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

test("diffCounts counts the added and removed lines of a unified diff", () => {
  const text = "@@ -1,3 +1,3 @@\n one\n-two\n+TWO\n+three\n-four\n";
  expect(diffCounts(text)).toEqual({ additions: 2, deletions: 2 });
  // Lines before the first hunk header are not part of any hunk.
  expect(diffCounts("--- a\n+++ b\n@@ -0,0 +1 @@\n+x\n")).toEqual({
    additions: 1,
    deletions: 0,
  });
  expect(diffCounts("")).toEqual({ additions: 0, deletions: 0 });
});

test("a permalink reads as a Markdown or a Typst link named by its lines", () => {
  const url = "https://github.com/o/r/blob/abc/src/a_b.ts#L3-L5";
  expect(markdownLink(url, "src/a_b.ts#L3-L5")).toBe(
    "[src/a_b.ts#L3-L5](https://github.com/o/r/blob/abc/src/a_b.ts#L3-L5)",
  );
  // Brackets would end a Markdown label early.
  expect(markdownLink("u", "a[1].ts")).toBe(String.raw`[a\[1\].ts](u)`);
  // Typst reads #, _ and the like as markup in content, and " ends a string.
  expect(typstLink(url, "src/a_b.ts#L3-L5")).toBe(
    String.raw`#link("https://github.com/o/r/blob/abc/src/a_b.ts#L3-L5")[src/a\_b.ts\#L3-L5]`,
  );
  expect(typstLink('u"x', "a")).toBe('#link("u\\"x")[a]');
});

describe("diffBlocks", () => {
  // Lines 10 to 12 of a 30-line file, the middle one changed; the old side
  // had two lines more above them.
  const hunks = parseUnified("@@ -12,3 +10,3 @@\n L10\n-old\n+L11\n L12\n");
  const lines = Array.from({ length: 30 }, (_, i) => `L${i + 1}`);
  const gaps = (blocks: DiffBlock[]) =>
    blocks.flatMap((b) => (b.kind === "gap" ? [[b.gap, b.hidden]] : []));
  const rows = (blocks: DiffBlock[]) =>
    blocks.flatMap((b) => (b.kind === "rows" ? b.rows : []));

  test("hides the unchanged lines around the hunks", () => {
    // Before the file is read, its end is known from its length alone, and
    // unknown without it.
    expect(gaps(diffBlocks(hunks, null, [], 30))).toEqual([
      [0, 9],
      [1, 18],
    ]);
    expect(gaps(diffBlocks(hunks, null, []))).toEqual([
      [0, 9],
      [1, null],
    ]);
    expect(gaps(diffBlocks(hunks, lines, []))).toEqual([
      [0, 9],
      [1, 18],
    ]);
    expect(rows(diffBlocks(hunks, lines, []))).toHaveLength(3);
  });

  test("opens a gap up from the next hunk and down from the previous one", () => {
    const blocks = diffBlocks(hunks, lines, [
      { up: 5, down: 0 },
      { up: 0, down: 4 },
    ]);
    expect(gaps(blocks)).toEqual([
      [0, 4],
      [1, 14],
    ]);
    const shown = rows(blocks);
    // Lines 5 to 9 above, numbered on the old side by the hunk below them.
    expect(shown[0].right).toMatchObject({ no: 5, text: "L5", kind: "context" });
    expect(shown[0].left).toMatchObject({ no: 7, text: "L5", kind: "context" });
    // Lines 13 to 16 below, numbered by the hunk above them.
    expect(shown.at(-1)!.right).toMatchObject({ no: 16, text: "L16" });
    expect(shown.at(-1)!.left).toMatchObject({ no: 18 });
  });

  test("opens the whole file when every gap opens all the way", () => {
    const all = { up: 0, down: Infinity };
    const blocks = diffBlocks(hunks, lines, [all, all]);
    expect(gaps(blocks)).toEqual([]);
    const shown = rows(blocks);
    expect(shown[0].right?.no).toBe(1);
    expect(shown.at(-1)!.right?.no).toBe(30);
    expect(shown.filter((r) => r.right)).toHaveLength(30);
  });
});

import { expect, test } from "vitest";
import { inlineSpans, messageBlocks } from "./message";

test("splits fenced code blocks out of a message body", () => {
  const body = "Intro line\n```rust\nfn main() {}\n```\nOutro";
  expect(messageBlocks(body)).toEqual([
    { kind: "text", text: "Intro line" },
    { kind: "code", text: "fn main() {}" },
    { kind: "text", text: "Outro" },
  ]);
});

test("an unclosed fence swallows the rest as code", () => {
  expect(messageBlocks("a\n```\ncode line")).toEqual([
    { kind: "text", text: "a" },
    { kind: "code", text: "code line" },
  ]);
});

test("a body without fences is one text block", () => {
  expect(messageBlocks("just\ntext")).toEqual([
    { kind: "text", text: "just\ntext" },
  ]);
});

test("consecutive bullet lines become one list block", () => {
  expect(messageBlocks("Changes:\n- first\n- second\n* third\nDone.")).toEqual([
    { kind: "text", text: "Changes:" },
    { kind: "list", items: ["first", "second", "third"] },
    { kind: "text", text: "Done." },
  ]);
});

test("indented continuation lines belong to their bullet item", () => {
  const body =
    "- lists actions first (create tag,\n" +
    "  create branch) and shows the input\n" +
    "- second item\n" +
    "  also wraps";
  expect(messageBlocks(body)).toEqual([
    {
      kind: "list",
      items: [
        "lists actions first (create tag, create branch) and shows the input",
        "second item also wraps",
      ],
    },
  ]);
});

test("an unindented line after a list starts a new paragraph", () => {
  expect(messageBlocks("- item\nplain text")).toEqual([
    { kind: "list", items: ["item"] },
    { kind: "text", text: "plain text" },
  ]);
});

test("a blank line ends the list", () => {
  expect(messageBlocks("- item\n\n  indented paragraph")).toEqual([
    { kind: "list", items: ["item"] },
    { kind: "text", text: "indented paragraph" },
  ]);
});

test("bullets inside code fences stay code", () => {
  expect(messageBlocks("```\n- not a bullet\n```")).toEqual([
    { kind: "code", text: "- not a bullet" },
  ]);
});

test("inlineSpans marks backtick runs as code", () => {
  expect(inlineSpans("use `foo()` and `bar`")).toEqual([
    { code: false, text: "use " },
    { code: true, text: "foo()" },
    { code: false, text: " and " },
    { code: true, text: "bar" },
  ]);
  // An unpaired backtick stays literal.
  expect(inlineSpans("a ` b")).toEqual([{ code: false, text: "a ` b" }]);
});

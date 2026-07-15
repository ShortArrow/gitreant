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

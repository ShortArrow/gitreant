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

test("hard-wrapped prose joins into one paragraph", () => {
  const body =
    "Boots Linux 5.11 (Altera socfpga) with a Buildroot rootfs (dropbear\n" +
    "ssh) on the HPS. The kernel/DT/rootfs are transferred over the serial\n" +
    "console with u-boot 'loady' (ymodem).";
  expect(messageBlocks(body)).toEqual([
    {
      kind: "text",
      text:
        "Boots Linux 5.11 (Altera socfpga) with a Buildroot rootfs (dropbear " +
        "ssh) on the HPS. The kernel/DT/rootfs are transferred over the serial " +
        "console with u-boot 'loady' (ymodem).",
    },
  ]);
});

test("blank lines split prose into separate paragraphs", () => {
  expect(messageBlocks("para one\nwraps\n\npara two")).toEqual([
    { kind: "text", text: "para one wraps" },
    { kind: "text", text: "para two" },
  ]);
});

test("four-space indented lines form a code block", () => {
  const body = "Load it:\n\n    make loady\n    reboot\n\nDone.";
  expect(messageBlocks(body)).toEqual([
    { kind: "text", text: "Load it:" },
    { kind: "code", text: "make loady\nreboot" },
    { kind: "text", text: "Done." },
  ]);
});

test("tab-indented lines form a code block too", () => {
  expect(messageBlocks("\techo 1 > /sys")).toEqual([
    { kind: "code", text: "echo 1 > /sys" },
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

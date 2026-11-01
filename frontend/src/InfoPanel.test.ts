import { expect, test } from "vitest";
import { formatInfo, toolItems } from "./InfoPanel";

test("formatInfo renders one 'label: value' line per item", () => {
  expect(
    formatInfo([
      { label: "CLI", value: "0.1.0 (abc123)" },
      { label: "Browser", value: "Mozilla/5.0" },
    ]),
  ).toBe("CLI: 0.1.0 (abc123)\nBrowser: Mozilla/5.0");
  expect(formatInfo([])).toBe("");
});

test("toolItems gives each tool its version, or says it was not found", () => {
  const t = (key: string) => (key === "infoToolMissing" ? "not found" : key);
  expect(
    toolItems(t, {
      version: "0.4.0",
      commit: "abc123",
      tools: [
        { name: "git", version: "git version 2.51.0" },
        { name: "gh", version: null },
      ],
    }),
  ).toEqual([
    { label: "git", value: "git version 2.51.0" },
    { label: "gh", value: "not found" },
  ]);
  expect(toolItems(t, null)).toEqual([]);
});

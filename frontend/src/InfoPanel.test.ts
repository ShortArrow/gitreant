import { expect, test } from "vitest";
import { formatInfo } from "./InfoPanel";

test("formatInfo renders one 'label: value' line per item", () => {
  expect(
    formatInfo([
      { label: "CLI", value: "0.1.0 (abc123)" },
      { label: "Browser", value: "Mozilla/5.0" },
    ]),
  ).toBe("CLI: 0.1.0 (abc123)\nBrowser: Mozilla/5.0");
  expect(formatInfo([])).toBe("");
});

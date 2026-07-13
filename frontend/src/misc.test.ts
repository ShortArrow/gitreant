import { expect, test } from "vitest";
import { signatureLabel, splitMessage } from "./CommitDetailPanel";
import { diffLineClass } from "./FileDiffPane";
import { clampWidth } from "./Resizer";
import { resolveTheme, toggleTheme } from "./theme";

test("splitMessage separates the summary from the body", () => {
  expect(splitMessage("subject\n\nbody line\nmore")).toEqual({
    summary: "subject",
    body: "body line\nmore",
  });
  expect(splitMessage("subject only")).toEqual({
    summary: "subject only",
    body: "",
  });
  expect(splitMessage("")).toEqual({ summary: "", body: "" });
});

test("signatureLabel covers every kind the server reports", () => {
  expect(signatureLabel(undefined)).toBe("Not signed");
  expect(signatureLabel("openpgp")).toBe("Signed (OpenPGP)");
  expect(signatureLabel("ssh")).toBe("Signed (SSH)");
  expect(signatureLabel("x509")).toBe("Signed (X.509)");
  expect(signatureLabel("unknown")).toBe("Signed");
});

test("diffLineClass keys off the unified-diff prefix", () => {
  expect(diffLineClass("@@ -1 +1 @@")).toContain("hunk");
  expect(diffLineClass("+added")).toContain("add");
  expect(diffLineClass("-removed")).toContain("remove");
  expect(diffLineClass(" context")).toContain("context");
});

test("clampWidth stays within the allowed range", () => {
  expect(clampWidth(100, 180, 480)).toBe(180);
  expect(clampWidth(1000, 180, 480)).toBe(480);
  expect(clampWidth(300.6, 180, 480)).toBe(301);
});

test("resolveTheme prefers the stored value over the OS preference", () => {
  expect(resolveTheme("dark", false)).toBe("dark");
  expect(resolveTheme("light", true)).toBe("light");
  expect(resolveTheme(null, true)).toBe("dark");
  expect(resolveTheme("garbage", false)).toBe("light");
  expect(toggleTheme("dark")).toBe("light");
});

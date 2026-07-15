import { expect, test } from "vitest";
import { format, parseLangSetting, resolveLang, MESSAGES } from "./i18n";

test("parseLangSetting falls back to auto", () => {
  expect(parseLangSetting("en")).toBe("en");
  expect(parseLangSetting("ja")).toBe("ja");
  expect(parseLangSetting("auto")).toBe("auto");
  expect(parseLangSetting(null)).toBe("auto");
  expect(parseLangSetting("fr")).toBe("auto");
});

test("resolveLang honors the override and detects Japanese browsers", () => {
  expect(resolveLang("ja", "en-US")).toBe("ja");
  expect(resolveLang("en", "ja")).toBe("en");
  expect(resolveLang("auto", "ja")).toBe("ja");
  expect(resolveLang("auto", "ja-JP")).toBe("ja");
  expect(resolveLang("auto", "en-US")).toBe("en");
  expect(resolveLang("auto", "fr")).toBe("en");
});

test("format substitutes {placeholders}", () => {
  expect(format("Open repository: {name}", { name: "repoA" })).toBe(
    "Open repository: repoA",
  );
  expect(format("{n} commits", { n: 5 })).toBe("5 commits");
  expect(format("plain")).toBe("plain");
});

test("both dictionaries cover the same keys", () => {
  expect(Object.keys(MESSAGES.ja).sort()).toEqual(
    Object.keys(MESSAGES.en).sort(),
  );
});

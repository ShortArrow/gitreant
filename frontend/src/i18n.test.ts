import { expect, test } from "vitest";
import {
  countKey,
  type CountKey,
  format,
  parseLangSetting,
  resolveLang,
  MESSAGES,
} from "./i18n";

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

test("countKey takes the One form for a single thing", () => {
  expect(countKey("filesCount", 1)).toBe("filesCountOne");
  expect(countKey("filesCount", 0)).toBe("filesCount");
  expect(countKey("filesCount", 2)).toBe("filesCount");
});

test("a count of one reads in the singular", () => {
  const one = (key: CountKey) =>
    format(MESSAGES.en[countKey(key, 1)], { n: 1 });

  expect(one("commitsCount")).toBe("1 commit");
  expect(one("unpushedCount")).toBe("1 unpushed commit");
  expect(one("chartCounting")).toBe("1 commit still being counted");
  expect(one("dirtyCount")).toBe("1 uncommitted change");
  expect(one("localBranchCount")).toBe("1 local-only branch");
});

test("both dictionaries cover the same keys", () => {
  expect(Object.keys(MESSAGES.ja).sort()).toEqual(
    Object.keys(MESSAGES.en).sort(),
  );
});

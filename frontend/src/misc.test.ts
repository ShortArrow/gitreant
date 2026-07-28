import { expect, test } from "vitest";
import {
  absolutePath,
  githubAuthorUrl,
  signatureLabel,
  splitMessage,
} from "./CommitDetailPanel";
import { analyzeNote } from "./Drawer";
import { format, MESSAGES, type MsgKey } from "./i18n";
import { signatureBadge } from "./RepoCard";
import { clampWidth } from "./Resizer";
import { parseButtonStyle } from "./settings";
import { resolveTheme, toggleTheme } from "./theme";

test("parseButtonStyle falls back to icon-label for unknown values", () => {
  expect(parseButtonStyle("icon")).toBe("icon");
  expect(parseButtonStyle("label")).toBe("label");
  expect(parseButtonStyle("icon-label")).toBe("icon-label");
  expect(parseButtonStyle(null)).toBe("icon-label");
  expect(parseButtonStyle("garbage")).toBe("icon-label");
});

test("signatureBadge maps the verification verdict to a label", () => {
  expect(signatureBadge(true)).toMatchObject({
    label: "Verified",
    className: "badge badge-signed badge-verified",
  });
  expect(signatureBadge(false)).toMatchObject({
    label: "Unverified",
    className: "badge badge-signed badge-unverified",
  });
  expect(signatureBadge(undefined)).toMatchObject({
    label: "Signed",
    className: "badge badge-signed",
  });
});

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

test("absolutePath joins in the separator its root is written in", () => {
  expect(absolutePath("/home/dev/repo", "src/main.rs")).toBe(
    "/home/dev/repo/src/main.rs",
  );
  expect(absolutePath("V:\\gitreant", "src/main.rs")).toBe(
    "V:\\gitreant\\src\\main.rs",
  );
  expect(absolutePath("\\\\host\\share\\repo", "a/b.txt")).toBe(
    "\\\\host\\share\\repo\\a\\b.txt",
  );
  // A trailing separator on the root must not double up.
  expect(absolutePath("/home/dev/repo/", "a.txt")).toBe("/home/dev/repo/a.txt");
  expect(absolutePath("C:\\repo\\", "a.txt")).toBe("C:\\repo\\a.txt");
});

test("githubAuthorUrl reads the account out of a noreply commit email", () => {
  expect(githubAuthorUrl("49699333+octocat@users.noreply.github.com")).toEqual({
    url: "https://github.com/octocat",
    profile: true,
  });
  expect(githubAuthorUrl("  Octocat@Users.NoReply.GitHub.com ")).toEqual({
    url: "https://github.com/octocat",
    profile: true,
  });
});

test("githubAuthorUrl falls back to a user search for other addresses", () => {
  expect(githubAuthorUrl("dev@example.com")).toEqual({
    url: "https://github.com/search?q=dev%40example.com&type=users",
    profile: false,
  });
  // Accountless and malformed noreply addresses name no user either.
  expect(githubAuthorUrl("noreply@github.com").profile).toBe(false);
  expect(githubAuthorUrl("49699333+dependabot[bot]@users.noreply.github.com")
    .profile).toBe(false);
});

test("clampWidth stays within the allowed range", () => {
  expect(clampWidth(100, 180, 480)).toBe(180);
  expect(clampWidth(1000, 180, 480)).toBe(480);
  expect(clampWidth(300.6, 180, 480)).toBe(301);
});

test("analyzeNote shows the running commit counter", () => {
  const t = (key: MsgKey, params?: Record<string, string | number>) =>
    format(MESSAGES.en[key], params);

  expect(analyzeNote(0, t)).toBe("Analyzing…");
  expect(analyzeNote(1200, t)).toBe("Analyzing… (1200 commits)");
});

test("resolveTheme prefers the stored value over the OS preference", () => {
  expect(resolveTheme("dark", false)).toBe("dark");
  expect(resolveTheme("light", true)).toBe("light");
  expect(resolveTheme(null, true)).toBe("dark");
  expect(resolveTheme("garbage", false)).toBe("light");
  expect(toggleTheme("dark")).toBe("light");
});

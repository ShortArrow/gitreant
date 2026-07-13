import { expect, test } from "vitest";
import type { FileChange } from "./api";
import { buildFileTree } from "./fileTree";

function change(path: string): FileChange {
  return { path, status: "M", additions: 1, deletions: 0 };
}

test("compresses chains of single-child directories", () => {
  const nodes = buildFileTree([
    change("src/app/deep/one.ts"),
    change("src/app/deep/two.ts"),
    change("README.md"),
  ]);

  expect(nodes).toHaveLength(2);
  expect(nodes[0]).toMatchObject({ kind: "dir", name: "src/app/deep" });
  const dir = nodes[0];
  if (dir.kind !== "dir") throw new Error("expected a dir");
  expect(dir.children.map((c) => c.name)).toEqual(["one.ts", "two.ts"]);
  expect(nodes[1]).toMatchObject({ kind: "file", name: "README.md" });
});

test("keeps branching directories apart, directories before files", () => {
  const nodes = buildFileTree([
    change("b.txt"),
    change("src/y/inner.ts"),
    change("src/x/inner.ts"),
    change("a.txt"),
  ]);

  // "src" branches into x and y, so it is not merged with either.
  expect(nodes.map((n) => `${n.kind}:${n.name}`)).toEqual([
    "dir:src",
    "file:a.txt",
    "file:b.txt",
  ]);
  const src = nodes[0];
  if (src.kind !== "dir") throw new Error("expected a dir");
  expect(src.children.map((c) => `${c.kind}:${c.name}`)).toEqual([
    "dir:x",
    "dir:y",
  ]);
});

test("a directory holding a file and a subdirectory is not compressed", () => {
  const nodes = buildFileTree([
    change("src/mod.rs"),
    change("src/detail/impl.rs"),
  ]);

  expect(nodes).toHaveLength(1);
  const src = nodes[0];
  if (src.kind !== "dir") throw new Error("expected a dir");
  expect(src.name).toBe("src");
  expect(src.children.map((c) => `${c.kind}:${c.name}`)).toEqual([
    "dir:detail",
    "file:mod.rs",
  ]);
});

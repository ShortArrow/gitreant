import type { FileChange } from "./api";

/** A changed-files tree: directories contain children, files carry the change.
 * Chains of single-child directories are compressed into one node
 * ("src/lib"), like GitHub and VSCode do. */
export type FileTreeNode =
  | { kind: "dir"; name: string; children: FileTreeNode[] }
  | { kind: "file"; name: string; change: FileChange };

type DirBuilder = {
  name: string;
  dirs: Map<string, DirBuilder>;
  files: FileChange[];
};

/** Build the display tree for `files` (paths use "/" as git reports them). */
export function buildFileTree(files: FileChange[]): FileTreeNode[] {
  const root: DirBuilder = { name: "", dirs: new Map(), files: [] };
  for (const change of files) {
    const parts = change.path.split("/");
    let node = root;
    for (const part of parts.slice(0, -1)) {
      let next = node.dirs.get(part);
      if (!next) {
        next = { name: part, dirs: new Map(), files: [] };
        node.dirs.set(part, next);
      }
      node = next;
    }
    node.files.push(change);
  }
  return children(root);
}

/** Sorted children of a directory: subdirectories first, then files. */
function children(dir: DirBuilder): FileTreeNode[] {
  const dirs = [...dir.dirs.values()]
    .map(compress)
    .sort((a, b) => a.name.localeCompare(b.name));
  const files = dir.files
    .map((change) => ({
      kind: "file" as const,
      name: change.path.split("/").pop() ?? change.path,
      change,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return [...dirs, ...files];
}

/** Merge a chain of directories that each contain nothing but one directory. */
function compress(dir: DirBuilder): FileTreeNode {
  let name = dir.name;
  let current = dir;
  while (current.files.length === 0 && current.dirs.size === 1) {
    const only = current.dirs.values().next().value as DirBuilder;
    name = `${name}/${only.name}`;
    current = only;
  }
  return { kind: "dir", name, children: children(current) };
}

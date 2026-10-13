# ADR 0033: Decide binary diffs by the diff attribute, as git diff does

## Status

Accepted (2026-10-14)

## Context

git decides how a file diffs by the `diff` attribute in `.gitattributes`.
`-diff`, and the `binary` macro that includes it, mean binary; `diff`
means text; `diff=<driver>` follows the `diff.<driver>.binary` setting.
Only when no attribute applies does git look for a NUL in the first 8000
bytes ([ADR 0006](0006-file-diff-on-demand.md)).

Up to 0.2.3, gitreant judged commit diffs and untracked files by the NUL
check alone. It counted lines and showed a text diff even for files git
treats as binary (`- -` in numstat). Tracked files among the uncommitted
changes go through the git CLI, so they already matched git.

`git diff <commit> <commit>` reads the `.gitattributes` of the working
tree, not the ones inside the commits it compares. For a directory missing
from the working tree, it reads the index. gix's diff pipeline
(`diff_resource_cache_for_tree_diff`) reads attributes from the HEAD index,
so an edited `.gitattributes` in the working tree has no effect there. That
pipeline also does not fit the line counting of ADR 0029, and 0.2.1
stopped using it.

## Decision

- **Whether a diff is binary is decided by the `diff` attribute first, and
  by the NUL check only when no attribute applies.** `-diff` and `binary`
  are binary, `diff` is text, and `diff=<driver>` follows
  `diff.<driver>.binary`, falling back to the NUL check when that is unset.
- **Attributes are read from the same places as `git diff`:** the working
  tree's `.gitattributes`, the index where the working tree has none, and
  `$GIT_DIR/info/attributes` and `core.attributesFile`. The
  `.gitattributes` inside the compared commits is not read. A bare
  repository reads the index only.
- **The decision lives in one place, `src/git/diff_attributes.rs`.** Commit
  line counts and diffs, and untracked file line counts and diffs, all go
  through it.

## Consequences

- Line counts and diffs match `git diff` file by file. Editing
  `.gitattributes` in the working tree changes how past commits show, just
  as it does in git.
- `diff.<driver>.textconv` is not run. A file whose driver sets textconv is
  judged by `diff.<driver>.binary` and the NUL check.
- The file list shows a binary file as `+0 −0`; there is no counterpart of
  git's `- -` yet.
- When the attributes cannot be read (a corrupt index, for instance), the
  NUL check decides alone.

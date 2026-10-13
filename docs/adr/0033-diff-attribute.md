# ADR 0033: Decide binary diffs by the diff attribute, as git diff does

## Status

Accepted (2026-10-14)

## Context

git decides how a file diffs by the `diff` attribute in `.gitattributes`.
`-diff`, and the `binary` macro that includes it, mean binary; `diff`
means text; `diff=<driver>` follows the `diff.<driver>.binary` setting.
Only when no attribute applies does git look for a NUL in the first 8000
bytes ([ADR 0006](0006-file-diff-on-demand.md)).

`git diff <commit> <commit>` reads attributes from `$GIT_DIR/info/attributes`,
the `.gitattributes` files in the working tree, and the global and system
attribute files (`core.attributesFile` and the like). It reads neither the
`.gitattributes` inside the compared commits nor the index, so a
`.gitattributes` in a directory removed from the working tree has no effect,
even while the index still holds it. A bare repository has only
`info/attributes` and the global and system files.

0.2.0 counted commit lines through gix's diff pipeline
(`diff_resource_cache_for_tree_diff`), so its counts followed the `diff`
attribute. That pipeline reads attributes from the HEAD index, so an edited
`.gitattributes` in the working tree had no effect, and the diff text was
judged by the NUL check alone. The pipeline does not fit the line counting
of ADR 0029, and 0.2.1 stopped using it. From 0.2.1 to 0.2.3, commit counts
and diffs and untracked files were judged by the NUL check alone. gitreant
counted lines and showed a text diff even for files git treats as binary
(`- -` in numstat). Tracked files among the uncommitted changes go through
the git CLI, so they have always matched git.

## Decision

- **Whether a diff is binary is decided by the `diff` attribute first, and
  by the NUL check only when no attribute applies.** `-diff` and `binary`
  are binary, `diff` is text, and `diff=<driver>` follows
  `diff.<driver>.binary`, falling back to the NUL check when that is unset.
- **Attributes are read from the same places as
  `git diff <commit> <commit>`.** Neither the index nor the
  `.gitattributes` inside the compared commits is read; gix is handed an
  empty index.
- **The decision lives in one place, `src/git/diff_attributes.rs`.** Commit
  line counts and diffs, and untracked file line counts and diffs, all go
  through it.

## Consequences

- Line counts and diffs match `git diff` except in the cases below. Editing
  `.gitattributes` in the working tree changes how past commits show, just
  as it does in git.
- The index is never loaded, so a large repository adds no cost per
  request.
- `diff.<driver>.textconv` is not run. A file whose driver sets textconv is
  judged by `diff.<driver>.binary` and the NUL check.
- An untracked file over 4 MiB is not read, so it is binary even with the
  `diff` attribute.
- A renamed file is judged by the attributes of its new path only. git
  treats it as binary when either the old or the new path is.
- The file list shows a binary file as `+0 −0`; there is no counterpart of
  git's `- -` yet.
- When the attributes cannot be read, the NUL check decides alone.

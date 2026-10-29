# ADR 0061: Read more of a file around its diff

## Status

Accepted (2026-10-29)

## Context

The diff pane shows each changed file as its hunks, three lines of
context around each change, separated by the hunks' `@@` lines. Reading a
little further above or below a change, or the whole file at that commit,
meant leaving gitreant for another tool. The server held no way to read a
file's content: every route returned a diff.

## Decision

- **The server reads a file's new side.** A route returns the content of
  a path on the side a diff leads to: the commit's tree for a commit, the
  later commit for a comparison of two, and the working tree for the
  uncommitted changes, read under the same size limit as an untracked
  file. A binary file, one too large to read, or a path absent on that
  side returns nothing.
- **Gaps open twenty lines at a time.** Where unchanged lines are hidden,
  before the first hunk, between two hunks and after the last, the `@@`
  line gives way to a row that names the hidden lines and opens them: up
  from the next hunk and down from the previous one, twenty at a time, or
  all at once when twenty or fewer remain. The lines shown are unchanged,
  so they read the same on both sides; their old line numbers follow the
  hunk next to them.
- **"Whole file" opens every gap.** A button in each file's head shows the
  file in full, its changes marked where they are.
- **The content is read on the first opening.** A file's content is asked
  for only when one of its gaps is first opened. Until then the gap after
  the last hunk offers to open without knowing how long it is; once the
  content is read, it shows only if lines remain. A file whose content
  cannot be read keeps its gaps closed and says so.
- **Opening clears the line selection,** as switching between inline and
  split does, since the rows it is counted in move.

## Consequences

- Splitting a diff into the rows and gaps to show is a pure function of
  the hunks, the file's lines and how far each gap is open, unit-tested;
  the route is tested by the adapter's tests, and the buttons end to end.

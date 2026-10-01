# ADR 0029: Show line-ending changes with a mark at the line end and a label on the file

## Status

Accepted (2026-10-01)

## Context

A working tree checked out by Windows git (`core.autocrlf=true`) shows every
file as changed when seen from git in WSL. The only difference is the line
endings (LF against CRLF), yet the diff pane listed every line as removed
and re-added with identical text, so nothing showed what had changed. git
prints a CRLF line with its CR still on it, but the server dropped that CR
from the diff text (Rust's `str::lines` for the working tree, an explicit
`trim` for commits). Commit line counts also came from gix's comparison
pipeline, which reported a line-ending-only change as "+0 −0".

## Decision

- **The server keeps the CR in the diff text.** For both the working tree
  and commits, a line's trailing CR reaches the client as git prints it.
- **The client takes the CR off the text and keeps it as a line property.**
  The text that lines are copied and permalinked from never contains a CR.
  Only when a paired removed and added line differ in their endings does it
  draw the ending (`␍␊` or `␊`), highlighted, at the end of both lines.
  Unpaired lines and context lines get no mark, so a new CRLF file does not
  carry one on every line.
- **A file is named "line endings only".** The server returns `eol_only`
  per file and the file list shows a label. For the working tree, these are
  the files that drop out of `git diff --numstat --ignore-cr-at-eol`; for
  commits, blob pairs that are identical once each line-ending CR is
  removed. The diff header shows the direction, worked out from the text
  (`LF → CRLF` and so on).
- **Commit line counts come from the raw blobs.** They use the same input
  as the diff text (gix-imara-diff's line comparison), so a line whose
  ending changed counts as changed, matching `git diff`.

## Consequences

- A mass line-ending conversion stands out in the file list without opening
  any diff.
- Commit line counts can change for files with CRLF content (lines whose
  ending changed now count). They now agree with the diff text shown.
- Counting commit lines reads each changed file's blobs. The comparison
  pipeline read them too, so the amount read stays about the same.
- The `core.autocrlf` difference itself (every file showing as changed from
  WSL) is not resolved here; that belongs to the user's git configuration or
  the repository's `.gitattributes`.

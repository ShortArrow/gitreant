# ADR 0070: Open only a file that lies in the working tree

## Status

Accepted (2026-10-31). Amends [ADR 0062](0062-open-with-editors.md).

## Context

A changed file opens with the operating system's default handler or with
one of the user's editors. ADR 0062 holds that "the path must stay inside
the repository" and that the file a request names is not trusted, since a
cloned repository's files are anyone's. The check behind both routes only
read the path's text: it refused an absolute path and any `..`. A path
through a directory link or junction, a file that is itself a link, and a
path into `.git` all passed it, so opening could reach a file outside the
repository, such as one in the user's home directory, or the repository's
own configuration. A file the default handler opens may be a program it
runs.

[ADR 0068](0068-read-only-changed-paths.md) checks the same things before
the working tree is read, but a file that is itself a link is read there
as its target's text, so only its directory is resolved. Opening a link
opens what it leads to.

## Decision

- **A file opens only when it is there and lies in the working tree.** No
  directory on its way is a link or junction, and where it resolves,
  through a link included, lies under the working tree with no part named
  `.git` in any case, outside the repository's git directories. This is
  ADR 0068's check with the link followed. A path that fails it is
  refused before any program is chosen, as one with `..` was.
- The repository's folder itself still opens without a path.

## Consequences

- A link to a file in the working tree opens that file. A link out of it,
  a path through a junction, a file under `.git` and a file no longer on
  disk do not open, and the menu shows nothing for them, as for any
  failure to open.
- The adapter's tests open a file in the working tree, `.git/config`,
  `.GIT/config` and a missing file; on Linux and macOS a link into the
  tree, a link out of it, a link to `.git/config` and a path through a
  linked directory; on Windows a path through a junction. A server test
  asks to open `.git/config` with an editor the list lacks and expects the
  path refused before the editor is looked up.

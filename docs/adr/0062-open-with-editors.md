# ADR 0062: Open a file with an editor from a list the user keeps

## Status

Accepted (2026-10-29)

## Context

A changed file's menu offered "Open in editor", which hands the file to
the operating system's default handler. A reader who keeps several
editors, or whose default for a file type is not an editor, had no way to
pick one. Choosing a program to run is a command on the user's machine;
the server already answers only its own page on the loopback address
([ADR 0038](0038-loopback-request-guard.md)), but a request that names a
program and its arguments would still let anything that reaches the page
run whatever it named.

## Decision

- **The list of editors lives with the server.** The server's
  configuration file, `config.toml`, holds each editor's name, program and
  arguments as an `[[editors]]` table. The file sits where the XDG base
  directories put configuration, on every system alike:
  `$XDG_CONFIG_HOME/gitreant`, else `.config/gitreant` in the home
  directory; `GITREANT_CONFIG_DIR` overrides it. Saving the list rewrites
  only its own table and keeps the file's other keys.
- **The settings dialog edits it.** A group of the settings lists the
  editors with their name, program and arguments, adds and removes rows,
  and saves the list to the server, which writes the file.
- **Opening names an editor, not a program.** The file's menu offers
  "Open with" and the name of each editor; the request carries the
  editor's place in the list, and the server runs that editor's program
  with its arguments, `{path}` replaced by the file's absolute path and
  `{line}` by a line number, 1 when none is given. The program runs
  directly, never through a shell, so a path cannot add a command, and the
  path must stay inside the repository as the default handler's does.
- **"Open with…" asks the system on Windows.** There the menu also offers
  the system's own chooser of an application. macOS and Linux have no such
  chooser to call, so they offer only the list.

## Consequences

- Reading and writing the list, filling the arguments and refusing paths
  outside the repository are unit-tested; an end-to-end test saves a list
  from the settings and opens a file with an editor from it.

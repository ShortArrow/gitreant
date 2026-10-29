# ADR 0062: Open a file with an editor from a list the user keeps

## Status

Accepted (2026-10-29)

## Context

A changed file's menu offered "Open in editor", which hands the file to
the operating system's default handler. A reader who keeps several
editors, or whose default for a file type is not an editor, had no way to
pick one. Choosing a program to run is a command on the user's machine.
The server answers only requests addressed to its loopback name, and a
page's request only from its own page
([ADR 0038](0038-loopback-request-guard.md)), but it accepts a request
that carries no `Origin` at all, as a program other than a browser sends.
On a machine other accounts share, such a program can reach the port; if
a request could name a program and its arguments, anything that reached
the port could run whatever it named as the server's user.

## Decision

- **The list of editors lives in the server's configuration file.**
  `config.toml` holds each editor's name, program and arguments as an
  `[[editors]]` table. The file sits where the XDG base directories put
  configuration, on every system alike: `$XDG_CONFIG_HOME/gitreant`, else
  `.config/gitreant` in the home directory; `GITREANT_CONFIG_DIR`
  overrides it.
- **Only the CLI and the user's hand write it.** `gitreant editor add`,
  `remove` and `list` edit the table, keeping the file's other keys, and
  the file may be edited by hand. The server only reads it: no request
  writes the list, and the settings dialog shows the editors, the file's
  path and the command that adds one.
- **Opening names an editor, not a program.** The file's menu offers
  "Open with" and the name of each editor; the request carries the
  editor's place in the list, and the server runs that editor's program
  with its arguments, `{path}` replaced by the file's absolute path and
  `{line}` by a line number, 1 when none is given; without `{path}`, the
  path goes last. Each replaces within one argument, and the program runs
  directly, never through a shell, so a path cannot add an argument or a
  command. The path must stay inside the repository, as the default
  handler's does, and being absolute it never reads as an option. The
  program runs detached, with no input or output of the server's.
- **What is trusted.** The programs and arguments in the file are the
  user's own, trusted as a shell's configuration is; the file a request
  names is not, since a cloned repository's files are anyone's. An
  "editor" that executes the file it opens, such as an interpreter, runs
  what the repository holds.
- **"Open with…" asks the system on Windows.** There the menu also offers
  the system's own chooser of an application, which runs nothing until
  the user picks. macOS and Linux have no such chooser to call, so they
  offer only the list.
- **On Windows a script is named with its extension.** The program is
  looked up as Rust's standard library does, which adds `.exe` only, so a
  batch launcher such as VS Code's is listed as `code.cmd`.

## Consequences

- Reading and writing the list, filling the arguments and refusing paths
  outside the repository are unit-tested; the CLI is tested end to end,
  and an end-to-end test checks the page cannot write the list and opens
  a file with an editor from it.
- Until requests carry a secret only the server's own page and CLI hold,
  any program on the machine can still ask to open a repository's file
  with a listed editor, as it can ask for the default handler.

# ADR 0078: Show a changed file in the file manager, and run nothing

## Status

Accepted (2026-11-02). Amends [ADR 0062](0062-open-with-editors.md) and
[ADR 0070](0070-open-in-working-tree.md).

## Context

The menu of a changed file offered "Open in editor", which handed the file
to the operating system's default handler. On Windows that handler runs a
`.cmd`, `.bat`, `.exe` or `.js` file instead of opening it. On 2026-11-02
a `run.cmd` committed to a repository ran when this was chosen and wrote a
marker file. ADR 0070 noted that a file the default handler opens may be a
program it runs, and left it. So the repository's file extension chose the
program to run, against the rule in [QUALITY](../QUALITY.md) that a request
picks a program only by its place in a list the user configured.

## Decision

- **A file goes to the file manager, not to the default handler.**
  `/api/reveal` shows it selected in Explorer (`explorer /select,`) or
  Finder (`open -R`), and elsewhere opens the folder holding it, where no
  opener can select a file. ADR 0070's checks on the path still come first.
- **The default handler opens only the repository's folder**, as the drawer
  asks.
- **The menu says what happens.** The file's entry reads as the drawer's
  does, "Reveal in file manager". Opening a file for editing stays with the
  editors the user listed and, on Windows, the system's chooser.

## Consequences

- Choosing the entry no longer opens a file in its default application.
- A program in a repository is shown and not run.
- On Linux, the file is not selected in the folder that opens.
- A unit test checks Explorer's argument. A Linux test faces a running
  server with an opener that records what it is handed, and checks that it
  gets the folder and that an executable file did not run. On 2026-11-02,
  on Windows, a running server was asked to reveal a `run.cmd` and its
  marker file did not appear.

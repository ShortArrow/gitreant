# ADR 0072: Open no browser that would show the secret to other accounts

## Status

Accepted (2026-10-31)

## Context

`gitreant` opens the browser on the page's address, which carries the
server's secret ([ADR 0063](0063-request-token.md)). On Linux and macOS,
where another account can read a process's command line, it hands the
browser a launcher file instead, so the command line names the file and
never the secret. In WSL, whose browser cannot open a Linux file, and when
the launcher file cannot be written, it handed the browser the address
itself: the program that opens the browser, and the browser, then carried
the secret on command lines other accounts can read.
[ADR 0071](0071-other-accounts-in-scope.md) puts those accounts in scope
and names these two cases gaps to close, since the user chose neither, as
they choose `--no-launcher`.

The address, secret included, is already printed in the terminal that
started the server, which only the user reads.

## Decision

- **Where neither the address nor a launcher file may be handed over, the
  browser is not opened.** The address may be handed over on Windows,
  where only an administrator reads another user's command line, and with
  `--no-launcher`; elsewhere only a launcher file is. In WSL and when the
  launcher file cannot be written, `gitreant` says it is not opening the
  browser, to open the address it printed, or to pass `--no-launcher`.
- `--no-launcher` keeps its meaning: the user's choice to hand over the
  address itself.

## Consequences

- In WSL the browser no longer opens on its own; the address printed in
  the terminal opens the page, and `--no-launcher` brings the old
  behaviour back.
- The choice of what to hand the browser is a pure function, unit-tested
  for the address allowed, a launcher file, and neither.

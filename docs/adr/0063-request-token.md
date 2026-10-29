# ADR 0063: Require a secret made at each start on every API request

## Status

Accepted (2026-10-29)

## Context

The server answers requests addressed to its loopback name, and a page's
only from its own page ([ADR 0038](0038-loopback-request-guard.md)). It
lets the rest through: "A request without `Origin` passes: browsers
attach it to every such request, so its absence means a client such as
the gitreant CLI, which could reach the port directly anyway." That holds
on a machine one person uses. Where other accounts share the machine,
or a container or sandbox shares its loopback, any of them reaches the
port too, and without `Origin` it may read every repository the server
shows, change them, and open their files with the user's editors
([ADR 0062](0062-open-with-editors.md)) as the user.

## Decision

- **A secret made at each start.** The server draws 32 bytes from the
  operating system's cryptographic random source at start and writes
  them as 64 hexadecimal digits. If the source fails, the server does not
  start: it never falls back to a weaker secret. The secret lives as long
  as the process; a restart makes a new one.
- **Every API request carries it.** A request to `/api/` needs the secret
  in the `X-Gitreant-Token` header, or, for the event stream a browser
  opens without headers, in a `token` query parameter; it is compared in
  constant time, and a request without it gets 401. `/api/ping`, which
  only says a gitreant answers, needs none, so the CLI can still find
  running servers. The page itself and its files need none either: they
  hold no repository's data.
- **The page gets it in the address that opens it.** The page's address
  is `http://127.0.0.1:<port>/#token=<secret>`. A fragment never reaches a
  server; the page reads it, takes it out of the address bar and its
  session history, and keeps it in the storage of its own origin, which a
  page on another port cannot read. A page opened without it, or with a
  secret from an earlier start, says to open gitreant from its command,
  and `gitreant list` prints each server's address with its secret.
- **On Linux and macOS, through a launcher file.** There another account
  can read a process's command line, for as long as the process lives, so
  `gitreant` gives the browser a file that only moves on to the address:
  `open-<port>.html`, its owner's alone, under the downloads directory on
  Linux, where browsers confined by snap or flatpak may read, else beside
  the records, and beside the records on macOS. The command line then
  names the file, never the secret; the file holds no more than the record
  does, and goes when the server stops. Windows lets only an administrator
  read another user's command line and may open `.html` in an editor, and
  a browser outside WSL cannot open a file inside it, so there, and with
  `--no-launcher`, the browser gets the address itself.
- **The CLI reads it from the server's record.** The record each server
  writes ([ADR 0039](0039-server-records.md)) holds its secret, in the
  user's own directory. On Unix the directory is its owner's alone, and a
  record is written as a new file only its owner may read and renamed into
  place, so one an older build left readable never holds the secret.
  The CLI's requests to a server carry the secret its record holds.
- **Not a signed token.** The secret says only that a request comes from
  the page or the CLI of this user and this start; it carries no claims,
  expiry or keys, so a JSON Web Token would add parsing and algorithm
  choices with nothing to carry.

## Consequences

- Reading the secret's header or query, comparing it in constant time and
  leaving `/api/ping` and the page open are unit-tested; the server's
  tests send the secret, and the end-to-end tests open the page from its
  address with the secret rather than adding it to the browser's every
  request, so they check that the page sends it.
- A bookmark of the bare address no longer opens a working page; it says
  how to open one.
- The browser's own history keeps the address it opened, secret included,
  in the user's profile, as the record keeps it in the user's directory;
  a later start makes it worthless.
- Where the browser is given the address itself, on Windows and in WSL or
  with `--no-launcher`, the secret is on the browser's command line, which
  an administrator can read.

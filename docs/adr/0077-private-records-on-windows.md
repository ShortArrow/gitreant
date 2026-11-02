# ADR 0077: Give the server records an access list of their own on Windows

## Status

Accepted (2026-11-02). Amends [ADR 0039](0039-server-records.md) and
[ADR 0063](0063-request-token.md).

## Context

Each server's record holds its secret ([ADR 0063](0063-request-token.md)),
and the CLI reads it to talk to the server. On Unix the records directory
is created with mode 0700 and each record with 0600. On Windows nothing was
set: the records live under `%LOCALAPPDATA%`, and a directory in the
user's profile was taken to be the user's alone.

It is not always. On 2026-11-02, on a machine with a sandbox installed,
`%LOCALAPPDATA%` granted the sandbox's group read access, inherited by the
records directory and by a live record; the group held two accounts that
are not administrators. [ADR 0071](0071-other-accounts-in-scope.md) puts
such accounts in scope: with the secret they could use the whole API.

## Decision

- **On Windows the records directory gets an access list of its own.**
  Whenever gitreant writes into it, it sets an access list inherited from
  nothing that grants the current user, SYSTEM and Administrators, for the
  directory and everything created in it. The records gitreant wrote there
  before take it too.
- **`GITREANT_STATE_DIR` names a directory the records go under.** They
  live in its `servers` subdirectory, as they do in `gitreant/servers`
  under the default state directory, so the access list is only ever set
  on a directory of gitreant's own.

## Consequences

- Another account reads a record only as an administrator, whatever the
  profile's directories grant.
- A server started before this change keeps its record's old access list
  until a server writes into the directory again.
- Where setting the access list fails, no record is written and the
  server says it could not record itself. Whether a drive that keeps no
  access lists, such as FAT, fails the call or takes it silently was not
  tried.
- A test lets every user read a parent, writes a record under it, then
  reads the access list back from the system and checks that the
  directory is protected from inheritance and that it and the record
  grant only the user, SYSTEM and Administrators.

# ADR 0064: Trust a running server only once it proves it holds the secret

## Status

Accepted (2026-10-29)

## Context

`gitreant` finds a running server by asking its port whether a gitreant
answers, and then forwards repositories to it, reads its list, and opens
its page with the secret from its record
([ADR 0063](0063-request-token.md)). Anything may answer that question.
Once the server has stopped, another account's program can take the port
and answer it; `gitreant` would then send it the repositories' paths and
the record's secret, read repositories to open from it, and open the
browser on its page, which may pass itself off as gitreant's.

## Decision

- **The server proves the secret without telling it.** Asked
  `/api/ping?challenge=<hex>`, the server answers with the marker and
  `HMAC-SHA256(secret, challenge)`. The answer tells nothing of the
  secret, and a new challenge each time makes an old answer useless.
- **The CLI asks before it trusts.** Before it forwards repositories,
  reads a running server's list to restart it, or opens its page, the CLI
  draws a challenge from the operating system's random source and checks
  the answer against the secret in the server's record, in constant time.
  A server that cannot prove it, or one with no record, is not the user's:
  the CLI says so and stops, sending it nothing and opening nothing.
- **Finding a server stays as it was.** The bare ping still only says a
  gitreant answers, for telling whether the port is taken and for
  clearing records of servers gone.

## Consequences

- The proof is unit-tested against a published HMAC-SHA256 vector, a
  server test checks the right secret passes and a wrong one fails, and a
  CLI test faces `gitreant` with a program that answers the ping as a
  gitreant would and checks that it sends nothing and opens nothing.
- Stopping a server or re-verifying signatures still only needs the
  record's secret: a server that does not hold it refuses them anyway.

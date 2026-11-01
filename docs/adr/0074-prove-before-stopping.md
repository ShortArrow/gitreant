# ADR 0074: Prove the secret before stopping a server or re-verifying its signatures

## Status

Accepted (2026-11-01). Amends [ADR 0064](0064-prove-the-secret.md).

## Context

[ADR 0064](0064-prove-the-secret.md) made the CLI ask a running server to
prove it holds the secret in its record before forwarding repositories to
it, reading its list or opening its page. Stopping a server and
re-verifying its signatures were left out: they sent the record's secret
once the port answered the bare ping, on the ground that a server that
does not hold the secret refuses them anyway.

A record outlives a server that did not exit cleanly, and another account
can take the port the server left. `gitreant --shutdown`, `gitreant
--shutdown --all` and `gitreant refresh` then sent that program the
record's secret. The secret was no longer any server's, but the CLI broke
the rule [QUALITY](../QUALITY.md) states, that it sends a server nothing
until the server proves it holds the secret, and reported success.

## Decision

- **Stopping and re-verifying ask for the proof first.** Before it sends
  either request, the CLI checks the server's answer to a fresh challenge
  against the secret in the record, as for every other request. A program
  that cannot prove it gets nothing, and the CLI says which port could not.
- **Nothing answering is said as such.** Where nothing answers the port,
  the CLI says no gitreant runs there before asking for any proof.

## Consequences

- Every request the CLI sends with a secret follows a proof of it.
- A port where a program answers the ping but cannot prove the secret is
  reported as such, not as stopped.
- A server of version 0.3.0, which keeps no record and holds no secret,
  can no longer be stopped or asked to re-verify from a newer CLI. It is
  stopped with its own `gitreant --shutdown`, or by ending its process.
- A CLI test faces `refresh`, `--shutdown` and `--shutdown --all` with a
  program that answers the ping as a gitreant would, and checks that each
  fails and sends it no secret and no request beyond the ping. Another
  checks the message where nothing answers.

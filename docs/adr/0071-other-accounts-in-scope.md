# ADR 0071: Defend the server against other accounts on its machine

## Status

Accepted (2026-10-31)

## Context

QUALITY stated that "single-user, same-machine use is assumed" and that
"remote exposure and multi-user use are out of scope". Two later
decisions defend against exactly the other users of the machine.
[ADR 0063](0063-request-token.md) requires a secret on every API request
because "where other accounts share the machine, or a container or
sandbox shares its loopback, any of them reaches the port", and
[ADR 0064](0064-prove-the-secret.md) has the CLI ask a server to prove
the secret because "once the server has stopped, another account's
program can take the port". Read with QUALITY's sentence, those
defences guard against something out of scope, so a finding about the
same attacker, such as a page served from a port the user's server left,
could be dismissed by one document and required by the other.

## Decision

- **Other accounts on the machine are in scope.** QUALITY assumes they,
  and containers or sandboxes sharing the machine's loopback, can reach
  the server's port and can take a port it has left. It does not assume
  they can read the user's files or memory: the secret lives in files
  only the user can read.
- **The user is still one person,** and an opened repository's content is
  still trusted, as QUALITY states. Remote exposure stays out of scope.

## Consequences

- A finding in which another account reaches the port, answers on a port
  the server left, or serves the page's origin is weighed as in scope.
- ADR 0063 and ADR 0064 stand on QUALITY's stated premise rather than
  against it.

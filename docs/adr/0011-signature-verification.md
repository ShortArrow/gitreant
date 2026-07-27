# ADR 0011: Delegate signature verification to the git/gpg CLI and cache verdicts

## Status

Accepted (2026-07-13)

## Context

The commit graph only badged the **presence** of a signature (gix
detection of the gpgsig header), but like GitHub's Verified badge we
also want to see whether the signature is **valid**. Signature
validity depends on the user's keyring (gpg / allowed signers), so
implementing cryptographic verification in gitreant itself would
overreach its responsibilities and be hard to reproduce across
environments.

## Decision

- Verification is delegated to a single execution of
  `git -c log.showsignature=false log --no-walk=unsorted
  --format=%H %G? <ids...>` (the same CLI delegation pattern as
  ADR 0007). If `gpg` is not on PATH, nothing is executed.
- Interpretation of `%G?`: `G`/`U` → **Verified**, `B`/`X`/`Y`/`R` →
  **Unverified**, `E`/`N`/anything else → no verdict (stays
  **Signed**). Unverified is not shown for the unverifiable — a
  missing key is distinguished from an invalid signature.
- Only commits that are signed (gix-detected) and have no verdict yet
  are targeted. Commits are immutable, so verdicts are cached
  permanently in a `HashMap<commit-id, status>` inside `Session`
  (keyring changes take effect on server restart). Verification
  failures are also cached as "no verdict", so a broken gpg
  environment does not re-execute and re-log on every read.
- The executed command is returned by `Session::views` as an
  `ExecutedCommand`, and the server records it in the command log
  (ADR 0009). The layer dependency direction stays
  server → app → git.

## Consequences

- In environments that have gpg and the signer's public key, the same
  Verified / Unverified as GitHub appears. Without them, the display
  stays at Signed as before.
- Verification launches just one process the first time a signed
  commit is seen and does not affect the repository-read hot path
  (gix).
- Verification via the GitHub API (gh) is not adopted: its scope of
  applicability is narrow and it is rate-limited. If it becomes
  necessary, it will be added in a separate ADR.

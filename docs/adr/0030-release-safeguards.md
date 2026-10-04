# ADR 0030: Check the tag, take notes from the changelog, and approve publishing

## Status

Accepted (2026-10-04)

## Context

`release.yml` ran to the end on nothing more than a tag push, and it had
these gaps:

- Nothing stopped a tag that disagreed with the version in `Cargo.toml` or
  was not on main. The GitHub Release was then published and the upload to
  crates.io failed afterwards.
- A prerelease tag tried to publish to crates.io too, so there was no way to
  try the whole pipeline. The only stop was `[skip publish]` in the tagged
  commit's message.
- The crates.io existence check went on to publish on any answer other than
  200, including a 5xx or a failed connection.
- Release notes were generated and rewritten by hand every time, and no
  record of the changes lived in the repository.
- Actions were referenced by tag, so a moved tag changed what ran.
  checkout left its token in the working tree, and jobs had no timeout.

The release flow of ssh-copy-id, by the same author, closes all of these.

## Decision

- **Check the tag first.** Stop when the tagged commit is not on main. A
  release tag (`vX.Y.Z`) passes only when it names the version in
  `Cargo.toml` and `CHANGELOG.md` has a section for it. The check lives in
  `.github/scripts/check-release-tag.sh`, and CI runs examples of its
  behaviour.
- **A prerelease tag (one containing `-`) is a rehearsal.** It skips the
  version and changelog checks and goes through the builds and the GitHub
  Release (marked as a prerelease). It never publishes to crates.io.
- **Publishing to crates.io goes through the `release` environment.** The
  environment waits for the owner's approval and admits only `v*` tags;
  crates.io Trusted Publishing accepts tokens only from that environment.
  To hold a release back from crates.io, reject the approval
  (`[skip publish]` is gone).
- **The crates.io check stops when it cannot tell.** On 200 the version is
  already published and nothing happens; on 404 it publishes; any other
  answer fails the job.
- **`CHANGELOG.md` (Keep a Changelog) is the record of changes.** A
  release's GitHub Release notes are its section, as written
  (`.github/scripts/release-notes.sh`). Since the text is copied into the
  release notes, links in it are absolute URLs. A prerelease keeps
  generated notes.
- **Actions are pinned to commit SHAs, with the release named in a trailing
  comment.** checkout runs with `persist-credentials: false`, every job has
  a `timeout-minutes`, and `gh release create` runs with `--verify-tag`.
  Rust is installed with `rustup` rather than a third-party action. The CI
  workflow follows the same rules.
- **`.github/SECURITY.md` says where to report a vulnerability.** Reports
  come through GitHub's private vulnerability reporting, and fixes go into
  the latest release only.

## Consequences

- A mistyped tag stops in the `Check the tag` job, before anything is
  published.
- A tag such as `v0.2.2-rc.1` tries the pipeline before a real release. The
  rehearsal's GitHub Release and tag are deleted by hand afterwards.
- A release now means writing its changelog section before bumping the
  version. CI checks on every run that the version in `Cargo.toml` has one.
- Publishing to crates.io waits for an approval, one extra click on GitHub
  after pushing the tag.
- Creating the `release` environment with its reviewer, and registering the
  environment name with crates.io Trusted Publishing, happen once outside
  the repository.
- Pinned actions do not update themselves. Update them by hand, or let
  Dependabot version updates do it.

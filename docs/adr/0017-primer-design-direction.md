# ADR 0017: Follow GitHub Primer when a UI design decision is unclear

## Status

Accepted (2026-07-14)

## Context

gitreant's UI has deliberately followed GitHub's look and behavior
(Verified/Unverified badges, the diff line-selection dropdown,
permalinks, and the adoption of Octicons = ADR 0016). Debating the
direction on every individual UI decision is wasteful; we want a
fixed decision criterion.

## Decision

- When unsure about UI appearance, vocabulary, or behavior, follow the
  conventions of **GitHub Primer** (https://primer.style/ — GitHub's
  design system). Icons are Octicons (already decided); for colors,
  spacing, and component behavior, Primer's patterns are the first
  candidate as well.
- This does **not necessarily mean adopting Primer's implementation**
  (@primer/react, etc.) as a dependency. What we reference is the
  design language; the implementation keeps the existing hand-written
  CSS. Introducing a component library is decided in a separate ADR
  when it becomes necessary.
- When a precedent more appropriate than GitHub exists for a git
  client (e.g. vscode-git-graph for graph rendering, lazygit for
  branch operations), it may take priority. Record that judgment in an
  ADR or a commit message.

## Consequences

- Discussions about "how to present this" shrink to checking "what
  does Primer do". The UI carries no learning cost for GitHub users.
- For users of non-GitHub hosting, Primer's look itself is neutral,
  with no disadvantage.

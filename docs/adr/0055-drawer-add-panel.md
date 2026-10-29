# ADR 0055: Add a repository from a button in the drawer's head

## Status

Accepted (2026-10-29)

## Context

The drawer's top held a path field, a Browse button and an Add button in
one row, always shown. The order read as a form in which Browse fills the
field and Add submits it, yet Browse added the folder it picked at once,
leaving the field alone. Right under the row sat the filter, a second
field of the same look with another purpose, and in a drawer 260 pixels
wide the two buttons left the path field narrow. Adding a repository is
occasional; filtering and choosing one are what the drawer is mostly used
for.

## Decision

- **An Add button in the drawer's head opens the add panel.** It sits
  beside the collapse button and follows the button style setting like
  the other buttons.
- **The panel holds a path field and "Choose folder…".** Enter in the
  field adds the path typed; "Choose folder…" opens the folder picker and
  adds the folder chosen. There is no separate Add button.
- **The panel closes when it is done with.** Opening it focuses the
  field; a successful add, Escape or the head's button again closes it,
  while a failed add keeps it open with the error.
- **An empty drawer shows the panel open.** With no repository listed,
  adding one is the only thing to do there.

## Consequences

- End-to-end tests add repositories through one helper, which opens the
  panel when it is closed.

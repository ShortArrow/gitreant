# ADR 0060: Add a repository from a row at the end of the list

## Status

Accepted (2026-10-29)

## Context

[ADR 0055](0055-drawer-add-panel.md) moved adding a repository behind a
button: "An Add button in the drawer's head opens the add panel." The
head sits above the filter and the sort, away from the rows the button
adds to, and a small icon there says little about what it adds. Browsers
that list tabs vertically, Chromium and Firefox among them, end the list
with a "New tab" row, so the control that adds a row sits where the row
will appear.

## Decision

- **A row at the end of the list adds a repository.** After the last
  repository, the list ends with a row named "Add repository" with a plus.
  It follows the button style like the other buttons. The drawer's head
  no longer holds an Add button.
- **The row opens in place.** Pressing it turns the row into the path
  field and "Choose folder…", as the panel of ADR 0055 held them, and
  their behavior stays: Enter adds the path typed, a successful add or
  Escape closes it back into the row, and a failed add keeps it open with
  the error.
- **An empty drawer shows it open.** Once the list is known to be empty,
  the row shows as the field, since adding is all the drawer offers then.

## Consequences

- The end-to-end helper that adds repositories opens the row when it is
  closed, as it opened the panel.

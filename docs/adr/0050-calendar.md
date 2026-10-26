# ADR 0050: A calendar of the history under the rows

## Status

Accepted (2026-10-26)

## Context

The rows read the history one commit at a time, and the chart of lines
over time ([ADR 0043](0043-cumulative-chart.md)) reads it as sums along
HEAD's first parents. Neither shows at a glance which days the work
happened on, how heavy each day was, or whether it added or removed
code, nor gives a way to jump to a day in the rows.

## Decision

- **A strip under the rows.** A "Calendar" button in the pane's header
  shows the calendar as a strip of fixed height under the rows, the
  chart or the diff, and hides it again. Each pane has its own.
- **Weeks as columns.** Each column is a week, starting on Monday, and
  each row a weekday, by the local calendar, from the week of the oldest
  loaded commit to the week of the newest, but no more than about ten
  years back from the newest: a commit's date is whatever its author
  wrote, and one dated centuries away must not stretch the calendar into
  millions of cells. Month names head the columns
  where a month begins; the first column's is left out when the next
  month begins too close to fit both. A long history scrolls sideways
  and opens at its newest end.
- **Reaching back page by page.** The calendar counts the loaded commits,
  and the rows load the history a page at a time
  ([ADR 0023](0023-progressive-loading.md)). Scrolling the calendar to its
  oldest end, or pressing "Older" there, reads the next page; the weeks
  it adds on the left leave the ones in view where they were. The
  calendar asks for a page at most every half second, and one asked for
  sooner waits rather than being dropped, so resting at the oldest end
  keeps reading without firing requests back to back.
- **A day's shade tells how much and which way.** A day with commits is
  filled more strongly the more lines its commits added and deleted
  together, on the same logarithmic scale as the thickness
  ([ADR 0044](0044-graph-thickness.md)). Its color runs from green, when
  the lines were all added, through to red, when they were all deleted.
  A day whose commits have no counts yet is outlined until they arrive.
  A row of buttons above the weeks shades by both kinds of lines, by the
  lines added alone in green, or by the lines deleted alone in red; a day
  without lines of the chosen kind is left blank. Both is the first
  choice, and as with the chart's series it is not saved.
  Hovering names the day, its commits and its lines added and deleted.
- **Every loaded commit but merges.** A day counts the commits of every
  branch loaded, so work not merged yet shows too. Merges are left out:
  their lines against the first parent repeat the merged commits' lines.
  The uncommitted row and stash entries are left out as well.
- **A day leads to its commits in the rows.** Clicking a day selects its
  newest commit in the rows and scrolls it into view, closing the chart
  if it is open. Clicking the same day again moves to the day's next
  older commit, and from its oldest back to its newest. The day of the
  commit selected in the rows is marked in the calendar.

## Consequences

- The days, the weeks, a day's shade and the next commit of a day are
  pure functions of the commits, checked by unit tests.
- The calendar takes some height from the rows while it shows.

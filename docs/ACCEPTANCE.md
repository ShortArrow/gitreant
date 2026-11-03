# Manual acceptance

A person follows these steps before a release, at the commit the version bump
will follow. The release may go ahead when every step reads as its "Passes
when" column says. When one does not, fix the cause and redo the steps it
affects.

A pass covers the operating system and browser it was done on, and only the
steps below. The automated suites cover the rest of the operating systems and
the behaviour they can assert.

## Prepare

Run these from the repository's root, in this order. `pnpm screenshot` leaves
the fixture repositories in `frontend/screenshot/.tmp`, and rewrites
`docs/images/`.

```console
$ cd frontend && pnpm screenshot && cd ..
$ make build
```

Below, `gitreant` means `target/release/gitreant`. Port 4700 keeps the steps
away from any server already running. Note the commit, the operating system
and the browser for [the record](#record-the-result).

## Open the page

| Do | Passes when |
|---|---|
| Run `gitreant doctor -p 4700` | The git line starts `[ok]`, and the last server line says no server runs on port 4700 |
| Run `gitreant -p 4700 frontend/screenshot/.tmp/aurora` | It prints `gitreant serving on http://127.0.0.1:4700/`, and the browser opens the page with `aurora`'s graph, with no prompt from the browser |
| Read the address bar and the browser's history | The address is `http://127.0.0.1:4700/`, and no entry has `token=` in it |
| Reload the page | The graph comes back, with no prompt to resend a form |
| Open `http://127.0.0.1:4700/` in a new tab | The tab says the page lacks the server's secret, and names `gitreant open` |
| Run `gitreant open -p 4700` | It prints `opened http://127.0.0.1:4700/`, and a tab opens with the graph |
| Run `gitreant -p 4700 frontend/screenshot/.tmp/notes` | It prints `added` and `already serving`, a tab opens, and `notes` is in the list of repositories |
| Run `gitreant list --verbose` | The line for port 4700 has this build's version, `aurora` reads `given at startup` and `notes` reads `added by the CLI` |

## Read the history

Use `aurora`'s tab.

| Do | Passes when |
|---|---|
| Look over the rows | Lanes do not share a color side by side, each counted row shows `+N -N`, and nothing overlaps or is cut off except long subjects ending in `...` |
| Rest the pointer on `feat(graph): topological lane layout` | A popup shows the message from `Assign each commit a column`, and the detail pane does not change |
| Rest the pointer on a graph node | The rows, nodes and edges off its first-parent chain fade, and come back when the pointer leaves |
| Drag the graph's background sideways, then let go | The thickness tilts as you drag, and turns back on release |
| Click that commit | The detail pane lists `docs/graph.md`, `src/graph.rs` and `src/lanes.rs` |
| Click `Diff all` | Each file's diff shows, and reads correctly |
| Press `↑`, then `↓`, then `Esc` until the selection clears | The selection moves up a row and back, and `Esc` closes the diff, then clears the selection |
| Click `Lines over time`, then click it again | A chart replaces the rows, then the rows come back |
| Click `Calendar`, then a shaded day | The calendar shows under the rows, and the day's commits are selected in the rows |
| Right-click the submodule's graph, and choose to open it in a tab | A tab opens with the submodule's history |

## Use the desktop

These steps reach programs outside the browser.

| Do | Passes when |
|---|---|
| Click `Add repository`, then `Choose folder…`, and pick `frontend/screenshot/.tmp/site` | The system's folder dialog opens in front of the browser, and `site` joins the list |
| In `aurora`, click `Uncommitted changes`, right-click `ideas.txt` and choose `Reveal in file manager` | The file manager shows `ideas.txt`, and nothing else starts |
| Run `gitreant editor add acceptance <a text editor's program> "{path}"`, reload the page, and right-click `ideas.txt` again | The menu has `Open with acceptance`, and choosing it opens the file in that editor |
| Run `gitreant editor remove acceptance` | `gitreant editor list` no longer lists it |

## Stop the server

| Do | Passes when |
|---|---|
| Open Settings and switch the language to Japanese, then back, and click `Theme` twice | The page changes language and theme each time, and every label stays readable |
| Run `gitreant restart -p 4700` | It prints `gitreant serving on http://127.0.0.1:4700/`, and opens no tab |
| Reload the tab | The tab says the page lacks the server's secret |
| Run `gitreant open -p 4700` | A tab opens with `aurora`, `notes` and `site` in the list |
| Run `gitreant --shutdown -p 4700` | It prints `gitreant on port 4700 shut down`, and `gitreant list` no longer lists port 4700 |

## Record the result

Write the commit, the operating system, the browser and the person who passed
it in the message of the commit that bumps the version. Name any operating
system this release ships for that no person tried.

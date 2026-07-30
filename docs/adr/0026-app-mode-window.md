# ADR 0026: Open a dedicated window via the browser's app mode, not a native GUI

## Status

Accepted (2026-07-30)

## Context

To open gitreant in a dedicated window rather than as one tab among many,
there are three options: bundle a native WebView (Tauri and friends),
have the user install it as a PWA, or launch a Chromium-based browser in
app mode (`--app=<url>`). ADR 0001 chose "single binary, no C toolchain"
as the distribution form, so the choice can conflict with that constraint.

## Decision

- **`--app` launches a Chromium-based browser with `--app=<url>`.** The
  only thing wanted is the window's appearance, and browsers already
  provide it. No new dependency and no change to the build.
- **No native WebView.** It would reintroduce a dependency on system C
  libraries such as WebKitGTK, breaking the premise of ADR 0001's
  distribution form: `cargo install` from crates.io would demand extra
  system packages, and a Termux build would stop being possible. What it
  adds over app mode is the window frame alone — the native file dialog
  already exists via `rfd`, and with the current architecture the
  localhost port stays either way.
- **No PWA either.** gitreant is CLI-driven, so the order "start the
  server, then show the window" has to hold. Launching from an installed
  icon lands on a blank page when no server is running. Origins are also
  per-port, so changing `--port` makes it a different app.
- **Share the ordinary browser profile.** No `--user-data-dir`. gitreant
  holds no credentials, so isolation buys nothing while making gitreant
  responsible for tens of megabytes of cache.
- **Fall back to the ordinary browser open when no Chromium-based browser
  is found.** The same degradation rule as ADR 0007 / 0013, without a
  warning. `--no-open` outranks `--app`: nothing opens.
- **The search takes the first existing entry from known locations, in
  preference order.** Browser preference (Chrome → Edge → Brave →
  Chromium) outranks directory order. On Windows these browsers register
  under App Paths rather than `PATH`, so the standard installation roots
  are probed directly. On macOS the executable inside the app bundle is
  invoked (`open -a` cannot pass Chromium's flags through). Elsewhere on
  unix `PATH` is scanned.

## Consequences

- On a Firefox-only machine and on Termux, `--app` changes nothing: the
  candidate list comes up empty and the ordinary open path runs.
- When a browser is already running, that process opens the app window.
  This follows from sharing the profile, and it starts quickly.
- Assembling the command (candidate expansion order, the shape of the
  `--app` argument) is unit-testable as pure functions. Whether a window
  actually appears depends on what is installed on the machine, so it is
  left out of the tests.
- ADR 0010's decision about *when* a browser opens (never on forwarding)
  is unchanged. This ADR decides only *what* is opened.

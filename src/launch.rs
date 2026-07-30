//! Browser launching for `--app`: open the SPA in a chromeless window
//! (Chromium's app mode) rather than a tab in the user's browsing session.
//!
//! Only the command is built here; spawning it is the caller's job. No
//! Chromium-based browser installed means `None`, and the caller falls back
//! to the ordinary browser open — the same silent degradation as the `gh`
//! and `gpg` integrations.

use std::path::{Path, PathBuf};

/// The command that opens `url` in a chromeless app window, or `None` when no
/// Chromium-based browser could be found.
pub fn app_window_command(url: &str) -> Option<(PathBuf, Vec<String>)> {
    let browser = first_present(&candidate_paths(), Path::is_file)?;
    Some((browser, vec![app_arg(url)]))
}

/// The argument that turns a Chromium browser into a chromeless window.
fn app_arg(url: &str) -> String {
    format!("--app={url}")
}

/// Every `dir`/`name` combination, name-major: a preferred browser in a
/// late directory beats a less preferred one in an early directory.
fn combinations(dirs: &[PathBuf], names: &[&str]) -> Vec<PathBuf> {
    names
        .iter()
        .flat_map(|name| dirs.iter().map(move |dir| dir.join(name)))
        .collect()
}

/// The first candidate `exists` accepts, in preference order.
fn first_present(candidates: &[PathBuf], exists: impl Fn(&Path) -> bool) -> Option<PathBuf> {
    candidates
        .iter()
        .find(|candidate| exists(candidate))
        .cloned()
}

/// Chromium-based browsers are not on `PATH` on Windows (they register under
/// App Paths instead), so probe the standard per-machine and per-user
/// installation roots directly.
#[cfg(windows)]
fn candidate_paths() -> Vec<PathBuf> {
    let roots: Vec<PathBuf> = ["ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"]
        .iter()
        .filter_map(std::env::var_os)
        .map(PathBuf::from)
        .collect();
    combinations(
        &roots,
        &[
            r"Google\Chrome\Application\chrome.exe",
            r"Microsoft\Edge\Application\msedge.exe",
            r"BraveSoftware\Brave-Browser\Application\brave.exe",
            r"Chromium\Application\chrome.exe",
        ],
    )
}

/// macOS keeps browsers in app bundles; the inner executable takes Chromium
/// flags, which `open -a` would swallow.
#[cfg(target_os = "macos")]
fn candidate_paths() -> Vec<PathBuf> {
    [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ]
    .iter()
    .map(PathBuf::from)
    .collect()
}

/// Elsewhere the browsers live on `PATH` under well-known names. Termux has
/// none of them, so the search comes up empty and the caller degrades to
/// `termux-open-url`.
#[cfg(all(unix, not(target_os = "macos")))]
fn candidate_paths() -> Vec<PathBuf> {
    let dirs: Vec<PathBuf> = std::env::var_os("PATH")
        .map(|path| std::env::split_paths(&path).collect())
        .unwrap_or_default();
    combinations(
        &dirs,
        &[
            "google-chrome",
            "google-chrome-stable",
            "microsoft-edge",
            "brave-browser",
            "chromium",
            "chromium-browser",
        ],
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn paths(values: &[&str]) -> Vec<PathBuf> {
        values.iter().map(PathBuf::from).collect()
    }

    #[test]
    fn app_arg_carries_the_url_into_chromiums_app_flag() {
        assert_eq!(
            app_arg("http://127.0.0.1:4000"),
            "--app=http://127.0.0.1:4000"
        );
    }

    #[test]
    fn combinations_order_browser_preference_above_directory_order() {
        let dirs = paths(&["/one", "/two"]);
        let got = combinations(&dirs, &["chrome", "edge"]);
        assert_eq!(
            got,
            paths(&["/one/chrome", "/two/chrome", "/one/edge", "/two/edge"])
        );
    }

    #[test]
    fn first_present_prefers_earlier_candidates_and_gives_up_when_none_exist() {
        let candidates = paths(&["/a/chrome", "/b/chrome", "/a/edge"]);
        assert_eq!(
            first_present(&candidates, |p| p != Path::new("/a/chrome")),
            Some(PathBuf::from("/b/chrome"))
        );
        assert_eq!(first_present(&candidates, |_| false), None);
    }

    #[test]
    fn this_platform_has_somewhere_to_look_for_a_browser() {
        assert!(
            !candidate_paths().is_empty(),
            "no candidate locations to probe on this platform"
        );
    }

    /// Whether a Chromium-based browser is installed is a property of the
    /// machine, not of gitreant, so the assertion is about the shape of the
    /// command when one *is* found. Absence is covered by `first_present`.
    #[test]
    fn a_found_browser_is_asked_to_open_the_url_as_an_app_window() {
        if let Some((browser, args)) = app_window_command("http://127.0.0.1:4000") {
            assert!(browser.is_file(), "{browser:?} is not an executable file");
            assert_eq!(args, vec!["--app=http://127.0.0.1:4000".to_string()]);
        }
    }
}

//! Browser launching for `--app`: open the SPA in a chromeless window
//! (Chromium's app mode) rather than a tab in the user's browsing session.
//!
//! Only the command is built here; spawning it is the caller's job. No
//! Chromium-based browser installed means `None`, and the caller falls back
//! to the ordinary browser open — the same silent degradation as the `gh`
//! and `gpg` integrations.

use std::path::{Path, PathBuf};

/// The page's address on `port`, with the server's secret in its fragment
/// when there is one: a fragment never reaches a server, and the page keeps
/// the secret for its requests (ADR 0063).
pub fn page_url(port: u16, token: Option<&str>) -> String {
    match token.filter(|token| !token.is_empty()) {
        Some(token) => format!("http://127.0.0.1:{port}/#token={token}"),
        None => format!("http://127.0.0.1:{port}/"),
    }
}

/// A page that only moves on to `url`, for the browser to open in its
/// place: the browser's command line then names a file, never the secret in
/// `url`, which other accounts could read there (ADR 0063). A refresh and a
/// link stand in where the script does not run.
pub fn launcher_html(url: &str) -> String {
    let quoted = serde_json::to_string(url).expect("a string serializes");
    format!(
        "<!doctype html>\n<meta charset=\"utf-8\">\n\
         <meta http-equiv=\"refresh\" content=\"0;url={url}\">\n\
         <title>gitreant</title>\n\
         <script>location.replace({quoted})</script>\n\
         <a href=\"{url}\">gitreant</a>\n"
    )
}

/// `path` as a `file:` URL, each byte outside a path's plain characters
/// percent-encoded.
pub fn file_url(path: &Path) -> String {
    let text = path.to_string_lossy().replace('\\', "/");
    let encoded: String = text
        .bytes()
        .map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' | b'/' | b':' => {
                (byte as char).to_string()
            }
            _ => format!("%{byte:02X}"),
        })
        .collect();
    if encoded.starts_with('/') {
        format!("file://{encoded}")
    } else {
        format!("file:///{encoded}")
    }
}

/// Where the launcher is written on Linux: under the downloads directory,
/// which browsers confined by snap or flatpak may read, else beside the
/// server's records.
pub fn launcher_dir(records: &Path) -> PathBuf {
    launcher_dir_from(
        |name| std::env::var(name).ok().filter(|value| !value.is_empty()),
        records,
        Path::is_dir,
    )
}

fn launcher_dir_from(
    var: impl Fn(&str) -> Option<String>,
    records: &Path,
    exists: impl Fn(&Path) -> bool,
) -> PathBuf {
    let downloads = var("XDG_DOWNLOAD_DIR")
        .map(PathBuf::from)
        .or_else(|| var("HOME").map(|home| Path::new(&home).join("Downloads")));
    match downloads {
        Some(dir) if exists(&dir) => dir.join(".gitreant"),
        _ => records.to_path_buf(),
    }
}

/// The launcher of the server on `port` inside `dir`.
pub fn launcher_path(dir: &Path, port: u16) -> PathBuf {
    dir.join(format!("open-{port}.html"))
}

/// Write the launcher that moves on to `url` for the server on `port`, its
/// owner's alone, as the record that holds the same secret is.
pub fn write_launcher(dir: &Path, port: u16, url: &str) -> std::io::Result<PathBuf> {
    crate::records::create_private_dir(dir)?;
    let path = launcher_path(dir, port);
    crate::records::write_private(&path, launcher_html(url).as_bytes())?;
    Ok(path)
}

/// What to hand the browser for the page at `url` (ADR 0072): the address
/// itself when `address_allowed`, where only an administrator reads a
/// command line or the user chose `--no-launcher`; else the `launcher`
/// file's address; else nothing, and the browser is not opened.
pub fn browser_target(
    address_allowed: bool,
    launcher: Option<String>,
    url: &str,
) -> Option<String> {
    if address_allowed {
        Some(url.to_string())
    } else {
        launcher
    }
}

/// Let a spawned program outlive this process and its console: its own
/// process group, and on Windows no console of ours.
#[cfg(windows)]
pub fn detach(command: &mut std::process::Command) {
    use std::os::windows::process::CommandExt;
    const DETACHED_PROCESS: u32 = 0x0000_0008;
    const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
    command.creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP);
}

#[cfg(unix)]
pub fn detach(command: &mut std::process::Command) {
    use std::os::unix::process::CommandExt;
    command.process_group(0);
}

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

    #[test]
    fn the_browser_gets_the_secret_only_where_no_other_account_reads_it() {
        let url = "http://127.0.0.1:4000/#token=5ec2e7";
        let file = "file:///home/u/Downloads/.gitreant/open-4000.html".to_string();
        assert_eq!(browser_target(true, None, url), Some(url.to_string()));
        assert_eq!(browser_target(false, Some(file.clone()), url), Some(file));
        assert_eq!(browser_target(false, None, url), None);
    }

    #[test]
    fn the_page_address_hands_the_secret_over_in_its_fragment() {
        assert_eq!(
            page_url(4000, Some("5ec2e7")),
            "http://127.0.0.1:4000/#token=5ec2e7"
        );
        assert_eq!(page_url(4000, None), "http://127.0.0.1:4000/");
        assert_eq!(page_url(4000, Some("")), "http://127.0.0.1:4000/");
    }

    #[test]
    fn a_launcher_page_moves_on_to_the_address_it_holds() {
        let html = launcher_html("http://127.0.0.1:4000/#token=5ec2e7");
        assert!(
            html.contains(r#"location.replace("http://127.0.0.1:4000/#token=5ec2e7")"#),
            "{html}"
        );
        assert!(html.contains(r#"content="0;url=http://127.0.0.1:4000/#token=5ec2e7""#));
        assert!(html.contains(r#"<a href="http://127.0.0.1:4000/#token=5ec2e7">"#));
    }

    #[test]
    fn a_file_url_encodes_what_a_path_may_hold() {
        assert_eq!(
            file_url(Path::new(
                "/home/John Doe/Downloads/.gitreant/open-4000.html"
            )),
            "file:///home/John%20Doe/Downloads/.gitreant/open-4000.html"
        );
        assert_eq!(
            file_url(Path::new("/Users/jü/a#b.html")),
            "file:///Users/j%C3%BC/a%23b.html"
        );
    }

    #[test]
    fn the_launcher_sits_where_a_sandboxed_browser_can_read_it() {
        let env = |pairs: &'static [(&str, &str)]| {
            move |name: &str| {
                pairs
                    .iter()
                    .find(|(key, _)| *key == name)
                    .map(|(_, value)| value.to_string())
            }
        };
        let records = Path::new("/run/user/1/gitreant/servers");
        let exists = |_: &Path| true;
        assert_eq!(
            launcher_dir_from(env(&[("XDG_DOWNLOAD_DIR", "/d")]), records, exists),
            Path::new("/d").join(".gitreant")
        );
        assert_eq!(
            launcher_dir_from(env(&[("HOME", "/h")]), records, exists),
            Path::new("/h").join("Downloads").join(".gitreant")
        );
        assert_eq!(
            launcher_dir_from(env(&[("HOME", "/h")]), records, |_| false),
            records
        );
    }

    #[cfg(unix)]
    #[test]
    fn a_launcher_is_its_owners_alone() {
        use std::os::unix::fs::PermissionsExt;
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join(".gitreant");
        let file = write_launcher(&dir, 4000, "http://127.0.0.1:4000/#token=s").unwrap();
        assert_eq!(file, dir.join("open-4000.html"));
        let mode = |path: &Path| std::fs::metadata(path).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode(&file), 0o600);
        assert_eq!(mode(&dir), 0o700);
    }

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

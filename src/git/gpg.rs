//! The gpg git runs to check signatures, so gitreant probes the same one.

use std::path::{Path, PathBuf};
use std::process::Command;

use super::fetch::hide_console;

/// The gpg git runs for OpenPGP signatures, and what chose it.
#[derive(Debug, Clone, PartialEq)]
pub struct GitGpg {
    /// The program, found on the `PATH` when named without a directory.
    pub program: PathBuf,
    /// The setting that named it, or `None` when git falls back to `gpg`.
    pub setting: Option<&'static str>,
    /// Git for Windows' own gpg, whose keyring is not the user's GnuPG one.
    pub bundled_with_git: bool,
}

/// The gpg git runs, read from the user's git configuration and `PATH`;
/// `None` when it names nothing that exists.
pub fn git_gpg() -> Option<GitGpg> {
    let (setting, name) = match configured(git_config) {
        Some((key, value)) => (Some(key), value),
        None => (None, "gpg".to_string()),
    };
    let path = std::env::var("PATH").unwrap_or_default();
    let program = find_on_path(&name, &path, Path::is_file)?;
    let bundled_with_git =
        cfg!(windows) && git_exec_path().is_some_and(|exec| bundled_with_git(&program, &exec));
    Some(GitGpg {
        program,
        setting,
        bundled_with_git,
    })
}

/// The program the OpenPGP format is set to run, by its newer setting
/// `gpg.openpgp.program` or its older name `gpg.program`.
fn configured(read: impl Fn(&str) -> Option<String>) -> Option<(&'static str, String)> {
    ["gpg.openpgp.program", "gpg.program"]
        .into_iter()
        .find_map(|key| read(key).map(|value| (key, value)))
}

/// `name` itself when it names a directory, else the first match on
/// `path`, trying `.exe` too on Windows.
fn find_on_path(name: &str, path: &str, exists: impl Fn(&Path) -> bool) -> Option<PathBuf> {
    if name.contains(['/', '\\']) {
        return Some(PathBuf::from(name));
    }
    let separator = if cfg!(windows) { ';' } else { ':' };
    let names: Vec<String> = if cfg!(windows) && !name.ends_with(".exe") {
        vec![format!("{name}.exe"), name.to_string()]
    } else {
        vec![name.to_string()]
    };
    path.split(separator)
        .filter(|dir| !dir.is_empty())
        .flat_map(|dir| names.iter().map(move |name| Path::new(dir).join(name)))
        .find(|candidate| exists(candidate))
}

/// Whether `gpg` lies inside the Git for Windows installation whose
/// `git --exec-path` is `exec` (`<root>/mingw64/libexec/git-core`).
fn bundled_with_git(gpg: &Path, exec: &Path) -> bool {
    exec.ancestors()
        .nth(3)
        .is_some_and(|root| gpg.starts_with(root))
}

fn git_config(key: &str) -> Option<String> {
    git_output(&["config", "--get", key])
}

fn git_exec_path() -> Option<PathBuf> {
    git_output(&["--exec-path"]).map(PathBuf::from)
}

fn git_output(args: &[&str]) -> Option<String> {
    let mut command = Command::new("git");
    command.args(args);
    hide_console(&mut command);
    let out = command.output().ok().filter(|out| out.status.success())?;
    let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
    (!text.is_empty()).then_some(text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_setting_names_the_program_before_the_path() {
        let config = |pairs: &'static [(&str, &str)]| {
            move |key: &str| {
                pairs
                    .iter()
                    .find(|(k, _)| *k == key)
                    .map(|(_, v)| v.to_string())
            }
        };
        assert_eq!(
            configured(config(&[
                ("gpg.openpgp.program", "/a/gpg"),
                ("gpg.program", "/b/gpg")
            ])),
            Some(("gpg.openpgp.program", "/a/gpg".to_string()))
        );
        assert_eq!(
            configured(config(&[("gpg.program", "/b/gpg")])),
            Some(("gpg.program", "/b/gpg".to_string()))
        );
        assert_eq!(configured(config(&[])), None);
    }

    #[test]
    fn a_bare_name_is_found_on_the_path_in_order() {
        let sep = if cfg!(windows) { ";" } else { ":" };
        let path = format!("/git/usr/bin{sep}/gnupg/bin");
        let exe = if cfg!(windows) { "gpg.exe" } else { "gpg" };
        let both = |p: &Path| p.ends_with(exe);
        assert_eq!(
            find_on_path("gpg", &path, both),
            Some(Path::new("/git/usr/bin").join(exe))
        );
        let second = |p: &Path| p.starts_with("/gnupg") && p.ends_with(exe);
        assert_eq!(
            find_on_path("gpg", &path, second),
            Some(Path::new("/gnupg/bin").join(exe))
        );
        assert_eq!(find_on_path("gpg", &path, |_| false), None);
        // A path is taken as it is.
        assert_eq!(
            find_on_path("/opt/gpg", &path, |_| false),
            Some(PathBuf::from("/opt/gpg"))
        );
    }

    #[test]
    fn git_for_windows_carries_a_gpg_of_its_own() {
        let exec = Path::new("C:/Program Files/Git/mingw64/libexec/git-core");
        assert!(bundled_with_git(
            Path::new("C:/Program Files/Git/usr/bin/gpg.exe"),
            exec
        ));
        assert!(!bundled_with_git(
            Path::new("C:/Program Files/GnuPG/bin/gpg.exe"),
            exec
        ));
    }
}

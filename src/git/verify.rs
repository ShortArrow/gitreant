//! Verify commit signatures by delegating to the `git` CLI (which runs gpg).
//!
//! gitreant itself only detects that a signature is present; whether it is
//! valid depends on the user's keyring, so the check is handed to the
//! installed `git`/`gpg` and skipped entirely when gpg is unavailable.

use std::collections::HashMap;
use std::path::Path;
use std::process::Command;
use std::sync::OnceLock;

use super::fetch::hide_console;

/// Whether a `gpg` binary is on the PATH. Checked once per process.
pub fn gpg_available() -> bool {
    static AVAILABLE: OnceLock<bool> = OnceLock::new();
    *AVAILABLE.get_or_init(|| {
        let mut command = Command::new("gpg");
        command.arg("--version");
        hide_console(&mut command);
        command
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    })
}

/// A commit's signature check: the raw `%G?` status and the signing key id
/// (`%GK`, empty when git could not attribute one).
pub type SignatureCheck = (char, Option<String>);

/// `-c log.showsignature=false` keeps user config from injecting gpg output
/// above the format lines; `--no-walk=unsorted` checks exactly the given ids.
fn verify_args(ids: &[String]) -> Vec<String> {
    let mut args = vec![
        "-c".to_string(),
        "log.showsignature=false".to_string(),
        "log".to_string(),
        "--no-walk=unsorted".to_string(),
        "--format=%H %G? %GK".to_string(),
    ];
    args.extend(ids.iter().cloned());
    args
}

/// The command line `verify_signatures` executes, for the command log.
pub fn verify_command(path: &Path, ids: &[String]) -> String {
    format!("git -C {} {}", path.display(), verify_args(ids).join(" "))
}

/// Ask git for the signature status (`%G?`) and key id (`%GK`) of each
/// commit in `ids`, keyed by full commit id.
pub fn verify_signatures(
    path: &Path,
    ids: &[String],
) -> Result<HashMap<String, SignatureCheck>, String> {
    let mut command = Command::new("git");
    command.arg("-C").arg(path).args(verify_args(ids));
    hide_console(&mut command);
    let output = command
        .output()
        .map_err(|e| format!("run git log: {e} (is git installed?)"))?;
    if output.status.success() {
        Ok(parse_statuses(&String::from_utf8_lossy(&output.stdout)))
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

/// Map a raw `%G?` status to a verification verdict.
///
/// `Some(true)` = a valid signature (G, or U for an untrusted key),
/// `Some(false)` = an invalid/expired/revoked one (B, X, Y, R),
/// `None` = could not be checked (missing key etc.) — presence only.
pub fn verification_state(status: char) -> Option<bool> {
    match status {
        'G' | 'U' => Some(true),
        'B' | 'X' | 'Y' | 'R' => Some(false),
        _ => None,
    }
}

fn parse_statuses(stdout: &str) -> HashMap<String, SignatureCheck> {
    stdout
        .lines()
        .filter_map(|line| {
            let (id, rest) = line.split_once(' ')?;
            let (status, key) = match rest.split_once(' ') {
                Some((status, key)) => (status, key.trim()),
                None => (rest.trim(), ""),
            };
            let looks_like_id = id.len() >= 7 && id.chars().all(|c| c.is_ascii_hexdigit());
            if !looks_like_id || status.chars().count() != 1 {
                return None;
            }
            let key = (!key.is_empty()).then(|| key.to_string());
            Some((id.to_string(), (status.chars().next().unwrap(), key)))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn parses_hash_status_and_key_id() {
        let map =
            parse_statuses("1111aaaa G 89AB89AB89AB89AB\n2222bbbb E \n3333cccc N\n\nnot a line\n");
        assert_eq!(
            map.get("1111aaaa"),
            Some(&('G', Some("89AB89AB89AB89AB".to_string())))
        );
        assert_eq!(map.get("2222bbbb"), Some(&('E', None)));
        assert_eq!(map.get("3333cccc"), Some(&('N', None)));
        assert_eq!(map.len(), 3);
    }

    #[test]
    fn maps_statuses_to_verdicts() {
        assert_eq!(verification_state('G'), Some(true));
        assert_eq!(verification_state('U'), Some(true));
        for bad in ['B', 'X', 'Y', 'R'] {
            assert_eq!(verification_state(bad), Some(false));
        }
        assert_eq!(verification_state('E'), None);
        assert_eq!(verification_state('N'), None);
    }

    #[test]
    fn verify_command_lists_the_requested_commits() {
        let cmd = verify_command(
            &PathBuf::from("/repos/demo"),
            &["1111aaaa".to_string(), "2222bbbb".to_string()],
        );
        assert!(cmd.starts_with("git "));
        assert!(cmd.contains("-C /repos/demo"));
        assert!(cmd.contains("%H %G? %GK"));
        assert!(cmd.contains("1111aaaa 2222bbbb"));
    }
}

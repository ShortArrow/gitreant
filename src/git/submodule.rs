//! Declared submodules of a repository, read from its `.gitmodules`.
//!
//! Only the declaration is read (name and path) — enough to group a repository
//! with its submodules in the drawer. Whether each submodule is initialized or
//! attached is left to the caller; an uninitialized one simply fails to open.

use std::path::{Path, PathBuf};
use std::process::Command;

use super::fetch::hide_console;

/// One submodule as declared in `.gitmodules`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Submodule {
    /// The submodule's configured name (`[submodule "<name>"]`).
    pub name: String,
    /// The declared path, relative to the superproject root — the key the
    /// superproject's trees index the gitlink under.
    pub rel: String,
    /// Absolute path to the submodule's working directory.
    pub path: PathBuf,
}

/// The submodules declared in `repo_root/.gitmodules`, with paths resolved
/// against `repo_root`. Empty when there is no `.gitmodules` (or it is
/// unreadable): a repository without submodules simply groups nothing.
pub fn read_submodules(repo_root: &Path) -> Vec<Submodule> {
    match std::fs::read_to_string(repo_root.join(".gitmodules")) {
        Ok(content) => parse_gitmodules(&content, repo_root),
        Err(_) => Vec::new(),
    }
}

/// Parse the `.gitmodules` INI: each `[submodule "<name>"]` section with a
/// `path = <rel>` becomes one entry, its path resolved against `repo_root`.
fn parse_gitmodules(content: &str, repo_root: &Path) -> Vec<Submodule> {
    let mut out = Vec::new();
    let mut name: Option<String> = None;
    let mut path: Option<String> = None;

    for raw in content.lines() {
        let line = raw.trim();
        if let Some(header) = line
            .strip_prefix("[submodule")
            .and_then(|rest| rest.strip_suffix(']'))
        {
            push(&mut name, &mut path, repo_root, &mut out);
            name = Some(header.trim().trim_matches('"').to_string());
        } else if let Some((key, value)) = line.split_once('=') {
            if key.trim() == "path" {
                path = Some(value.trim().to_string());
            }
        }
    }
    push(&mut name, &mut path, repo_root, &mut out);
    out
}

/// Emit the section built so far, if it named a path, and reset both fields.
fn push(
    name: &mut Option<String>,
    path: &mut Option<String>,
    repo_root: &Path,
    out: &mut Vec<Submodule>,
) {
    if let Some(rel) = path.take() {
        let name = name.take().unwrap_or_else(|| rel.clone());
        out.push(Submodule {
            name,
            path: repo_root.join(&rel),
            rel,
        });
    } else {
        *name = None;
    }
}

/// One submodule-pointer update: superproject `commit` moved the gitlink at
/// some path to name submodule commit `sha`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GitlinkUpdate {
    pub commit: String,
    pub sha: String,
}

/// Every commit (from any ref) that changed the gitlink at `rel`, newest
/// first, with the submodule sha it moved the pointer to. One `git log --raw`
/// covers the whole history; a failing run contributes nothing.
pub fn gitlink_updates(repo_root: &Path, rel: &str) -> Vec<GitlinkUpdate> {
    let mut command = Command::new("git");
    command.arg("-C").arg(repo_root).args([
        "log",
        "--all",
        "--format=%H",
        "--raw",
        "--no-abbrev",
        "--no-renames",
        "--",
        rel,
    ]);
    hide_console(&mut command);
    command
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| parse_gitlink_log(&String::from_utf8_lossy(&o.stdout), rel))
        .unwrap_or_default()
}

/// Parse `git log --format=%H --raw` output: bare 40-hex lines name the
/// current commit; `:oldmode newmode oldsha newsha status<TAB>path` lines are
/// its raw changes. A change whose new mode is 160000 (a live gitlink) at
/// `rel` is one pointer update.
fn parse_gitlink_log(stdout: &str, rel: &str) -> Vec<GitlinkUpdate> {
    let mut out = Vec::new();
    let mut commit = "";
    for line in stdout.lines() {
        if let Some(rest) = line.strip_prefix(':') {
            let Some((meta, path)) = rest.split_once('\t') else {
                continue;
            };
            if path != rel || commit.is_empty() {
                continue;
            }
            let fields: Vec<&str> = meta.split_whitespace().collect();
            if fields.len() < 5 {
                continue;
            }
            let (new_mode, new_sha) = (fields[1], fields[3]);
            if new_mode == "160000" && new_sha.bytes().any(|b| b != b'0') {
                out.push(GitlinkUpdate {
                    commit: commit.to_string(),
                    sha: new_sha.to_string(),
                });
            }
        } else if !line.trim().is_empty() {
            commit = line.trim();
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_named_sections_with_paths_resolved_against_the_root() {
        let content = r#"
[submodule "libs/foo"]
	path = libs/foo
	url = https://example.com/foo.git
[submodule "vendor-bar"]
	url = https://example.com/bar.git
	path = vendor/bar
"#;
        let root = Path::new("/repos/app");
        let subs = parse_gitmodules(content, root);
        assert_eq!(
            subs,
            vec![
                Submodule {
                    name: "libs/foo".to_string(),
                    rel: "libs/foo".to_string(),
                    path: root.join("libs/foo"),
                },
                Submodule {
                    name: "vendor-bar".to_string(),
                    rel: "vendor/bar".to_string(),
                    path: root.join("vendor/bar"),
                },
            ]
        );
    }

    #[test]
    fn a_section_without_a_path_is_skipped() {
        let content = "[submodule \"broken\"]\n\turl = x\n[submodule \"ok\"]\n\tpath = sub\n";
        let subs = parse_gitmodules(content, Path::new("/r"));
        assert_eq!(subs.len(), 1);
        assert_eq!(subs[0].name, "ok");
        assert_eq!(subs[0].path, Path::new("/r").join("sub"));
    }

    #[test]
    fn empty_or_pathless_modules_yield_nothing() {
        assert!(parse_gitmodules("", Path::new("/r")).is_empty());
        assert!(parse_gitmodules("# just a comment\n", Path::new("/r")).is_empty());
    }

    const A: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const B: &str = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const C: &str = "cccccccccccccccccccccccccccccccccccccccc";
    const D: &str = "dddddddddddddddddddddddddddddddddddddddd";
    const ZERO: &str = "0000000000000000000000000000000000000000";

    #[test]
    fn parses_pointer_moves_and_the_adding_commit() {
        // Newest first: commit A moved sub to C, commit B added it as D.
        let log = format!(
            "{A}\n\n:160000 160000 {D} {C} M\tsub\n\n{B}\n\n:000000 160000 {ZERO} {D} A\tsub\n"
        );
        assert_eq!(
            parse_gitlink_log(&log, "sub"),
            vec![
                GitlinkUpdate {
                    commit: A.to_string(),
                    sha: C.to_string(),
                },
                GitlinkUpdate {
                    commit: B.to_string(),
                    sha: D.to_string(),
                },
            ]
        );
    }

    #[test]
    fn other_paths_deletions_and_non_gitlinks_are_skipped() {
        let log = format!(
            "{A}\n\n:160000 000000 {C} {ZERO} D\tsub\n:100644 100644 {C} {D} M\tsub/file\n:000000 160000 {ZERO} {D} A\tother\n"
        );
        assert_eq!(parse_gitlink_log(&log, "sub"), vec![]);
        assert_eq!(parse_gitlink_log("", "sub"), vec![]);
    }
}

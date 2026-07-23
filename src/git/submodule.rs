//! Declared submodules of a repository, read from its `.gitmodules`.
//!
//! Only the declaration is read (name and path) — enough to group a repository
//! with its submodules in the drawer. Whether each submodule is initialized or
//! attached is left to the caller; an uninitialized one simply fails to open.

use std::path::{Path, PathBuf};

/// One submodule as declared in `.gitmodules`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Submodule {
    /// The submodule's configured name (`[submodule "<name>"]`).
    pub name: String,
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
            path: repo_root.join(rel),
        });
    } else {
        *name = None;
    }
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
                    path: root.join("libs/foo"),
                },
                Submodule {
                    name: "vendor-bar".to_string(),
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
}

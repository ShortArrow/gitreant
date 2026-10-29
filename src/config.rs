//! The server's configuration file, `config.toml`, where the user keeps the
//! editors a file can be opened with (ADR 0062).

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// The file's name inside the configuration directory.
const FILE: &str = "config.toml";

/// One editor the user keeps: how it is named in the menu, the program
/// that runs, and its arguments, where `{path}` and `{line}` are filled in.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Editor {
    pub name: String,
    pub program: String,
    #[serde(default)]
    pub args: Vec<String>,
}

/// The directory the file lives in, where the XDG base directories put
/// configuration, on every system alike.
pub fn dir() -> Option<PathBuf> {
    dir_from(|name| std::env::var(name).ok().filter(|value| !value.is_empty()))
}

fn dir_from(var: impl Fn(&str) -> Option<String>) -> Option<PathBuf> {
    if let Some(dir) = var("GITREANT_CONFIG_DIR") {
        return Some(PathBuf::from(dir));
    }
    let base = match var("XDG_CONFIG_HOME") {
        Some(config) => PathBuf::from(config),
        None => Path::new(&var("HOME").or_else(|| var("USERPROFILE"))?).join(".config"),
    };
    Some(base.join("gitreant"))
}

/// The configuration file inside `dir`.
pub fn file(dir: &Path) -> PathBuf {
    dir.join(FILE)
}

/// The file's keys, or none when it is missing or not TOML.
fn table(dir: &Path) -> toml::Table {
    std::fs::read_to_string(dir.join(FILE))
        .ok()
        .and_then(|text| text.parse().ok())
        .unwrap_or_default()
}

/// The editors the file in `dir` lists; none when it lists none or cannot
/// be read.
pub fn editors(dir: &Path) -> Vec<Editor> {
    table(dir)
        .remove("editors")
        .and_then(|value| value.try_into().ok())
        .unwrap_or_default()
}

/// Replace the file's list of editors with `list`, keeping its other keys
/// and creating the directory.
pub fn save_editors(dir: &Path, list: &[Editor]) -> std::io::Result<()> {
    let mut table = table(dir);
    let value = toml::Value::try_from(list).map_err(std::io::Error::other)?;
    table.insert("editors".to_string(), value);
    let text = toml::to_string(&table).map_err(std::io::Error::other)?;
    std::fs::create_dir_all(dir)?;
    std::fs::write(dir.join(FILE), text)
}

/// `editor`'s arguments for opening `path` at `line`: `{path}` and
/// `{line}` filled in, or the path appended as one argument when no
/// argument names it.
pub fn arguments(editor: &Editor, path: &Path, line: u32) -> Vec<String> {
    let path = path.display().to_string();
    let mut args: Vec<String> = editor
        .args
        .iter()
        .map(|arg| {
            arg.replace("{path}", &path)
                .replace("{line}", &line.to_string())
        })
        .collect();
    if !editor.args.iter().any(|arg| arg.contains("{path}")) {
        args.push(path);
    }
    args
}

#[cfg(test)]
mod tests {
    use super::*;

    fn env<'a>(pairs: &'a [(&str, &str)]) -> impl Fn(&str) -> Option<String> + 'a {
        |name| {
            pairs
                .iter()
                .find(|(key, _)| *key == name)
                .map(|(_, value)| value.to_string())
        }
    }

    #[test]
    fn the_file_sits_where_xdg_puts_configuration_on_every_system() {
        assert_eq!(
            dir_from(env(&[("GITREANT_CONFIG_DIR", "/c"), ("HOME", "/h")])),
            Some(PathBuf::from("/c"))
        );
        assert_eq!(
            dir_from(env(&[("XDG_CONFIG_HOME", "/x"), ("HOME", "/h")])),
            Some(Path::new("/x").join("gitreant"))
        );
        assert_eq!(
            dir_from(env(&[("HOME", "/h")])),
            Some(Path::new("/h").join(".config").join("gitreant"))
        );
        // Windows names the home directory USERPROFILE.
        assert_eq!(
            dir_from(env(&[("USERPROFILE", "/u")])),
            Some(Path::new("/u").join(".config").join("gitreant"))
        );
        assert_eq!(dir_from(env(&[])), None);
    }

    #[test]
    fn saving_the_editors_keeps_the_files_other_keys() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join("gitreant");
        assert_eq!(editors(&dir), Vec::new(), "no file holds no editors");

        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join(FILE), "theme = \"dark\"\n").unwrap();
        let list = vec![Editor {
            name: "Code".to_string(),
            program: "code".to_string(),
            args: vec!["--goto".to_string(), "{path}:{line}".to_string()],
        }];
        save_editors(&dir, &list).unwrap();
        assert_eq!(editors(&dir), list);
        let text = std::fs::read_to_string(dir.join(FILE)).unwrap();
        assert!(text.contains("theme = \"dark\""), "{text}");

        std::fs::write(dir.join(FILE), "not = [toml").unwrap();
        assert_eq!(editors(&dir), Vec::new(), "a broken file holds none");
    }

    #[test]
    fn fills_the_path_and_line_into_the_arguments() {
        let editor = Editor {
            name: "Code".to_string(),
            program: "code".to_string(),
            args: vec!["--goto".to_string(), "{path}:{line}".to_string()],
        };
        let path = Path::new("/r/a b.txt");
        assert_eq!(
            arguments(&editor, path, 7),
            vec!["--goto".to_string(), format!("{}:7", path.display())]
        );
        // Without `{path}`, the path goes last, as one argument.
        let plain = Editor {
            args: Vec::new(),
            ..editor
        };
        assert_eq!(arguments(&plain, path, 1), vec![path.display().to_string()]);
    }
}

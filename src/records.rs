//! A record of each running server, so the CLI can find one it was not
//! given the port of (ADR 0039). A record is only a hint: it counts while
//! its port answers as a gitreant, and is deleted once it does not.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// What a running server writes about itself once it is listening.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Record {
    pub port: u16,
    pub pid: u32,
    /// Unix seconds.
    pub started: i64,
    pub version: String,
}

/// The server a command that talks to a running one should act on.
#[derive(Debug, PartialEq)]
pub enum Target {
    Port(u16),
    /// Several run and none was named.
    Many(Vec<Record>),
}

/// The per-user directory the records live in, from the environment.
pub fn dir() -> Option<PathBuf> {
    dir_from(|name| std::env::var(name).ok().filter(|value| !value.is_empty()))
}

fn dir_from(var: impl Fn(&str) -> Option<String>) -> Option<PathBuf> {
    if let Some(dir) = var("GITREANT_STATE_DIR") {
        return Some(PathBuf::from(dir));
    }
    let base = if cfg!(windows) {
        PathBuf::from(var("LOCALAPPDATA")?)
    } else if cfg!(target_os = "macos") {
        Path::new(&var("HOME")?).join("Library").join("Caches")
    } else if let Some(runtime) = var("XDG_RUNTIME_DIR") {
        PathBuf::from(runtime)
    } else if let Some(state) = var("XDG_STATE_HOME") {
        PathBuf::from(state)
    } else {
        Path::new(&var("HOME")?).join(".local").join("state")
    };
    Some(base.join("gitreant").join("servers"))
}

/// Write `record` as `<port>.json` in `dir`, creating the directory.
pub fn write(dir: &Path, record: &Record) -> std::io::Result<()> {
    std::fs::create_dir_all(dir)?;
    let text = serde_json::to_string(record).map_err(std::io::Error::other)?;
    std::fs::write(path_of(dir, record.port), text)
}

/// Delete the record of `port`, if any.
pub fn remove(dir: &Path, port: u16) {
    let _ = std::fs::remove_file(path_of(dir, port));
}

/// The records whose port `answers` as a gitreant, by port; the others are
/// deleted.
pub fn running(dir: &Path, answers: impl Fn(u16) -> bool) -> Vec<Record> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut live: Vec<Record> = entries
        .flatten()
        .filter_map(|entry| {
            let text = std::fs::read_to_string(entry.path()).ok()?;
            serde_json::from_str::<Record>(&text).ok()
        })
        .filter(|record| {
            let up = answers(record.port);
            if !up {
                remove(dir, record.port);
            }
            up
        })
        .collect();
    live.sort_by_key(|record| record.port);
    live
}

/// The port a command acts on: the one named, else the only running
/// server, else `default` when none runs.
pub fn target(named: Option<u16>, running: &[Record], default: u16) -> Target {
    match (named, running) {
        (Some(port), _) => Target::Port(port),
        (None, []) => Target::Port(default),
        (None, [only]) => Target::Port(only.port),
        (None, many) => Target::Many(many.to_vec()),
    }
}

fn path_of(dir: &Path, port: u16) -> PathBuf {
    dir.join(format!("{port}.json"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn record(port: u16) -> Record {
        Record {
            port,
            pid: 100 + u32::from(port),
            started: 1_700_000_000,
            version: "0.3.0".to_string(),
        }
    }

    #[test]
    fn the_directory_follows_the_platform_and_the_override() {
        let env = |pairs: &[(&str, &str)]| {
            let map: HashMap<String, String> = pairs
                .iter()
                .map(|(k, v)| (k.to_string(), v.to_string()))
                .collect();
            move |name: &str| map.get(name).cloned()
        };
        assert_eq!(
            dir_from(env(&[("GITREANT_STATE_DIR", "/t/state"), ("HOME", "/h")])),
            Some(PathBuf::from("/t/state"))
        );
        let base = dir_from(env(&[
            ("LOCALAPPDATA", "/l"),
            ("XDG_RUNTIME_DIR", "/run/user/1"),
            ("XDG_STATE_HOME", "/s"),
            ("HOME", "/h"),
        ]))
        .unwrap();
        if cfg!(windows) {
            assert_eq!(base, Path::new("/l").join("gitreant").join("servers"));
        } else if cfg!(target_os = "macos") {
            assert_eq!(base, Path::new("/h/Library/Caches/gitreant/servers"));
        } else {
            assert_eq!(base, Path::new("/run/user/1/gitreant/servers"));
            assert_eq!(
                dir_from(env(&[("XDG_STATE_HOME", "/s"), ("HOME", "/h")])),
                Some(PathBuf::from("/s/gitreant/servers"))
            );
            assert_eq!(
                dir_from(env(&[("HOME", "/h")])),
                Some(PathBuf::from("/h/.local/state/gitreant/servers"))
            );
        }
        if !cfg!(windows) {
            assert_eq!(dir_from(env(&[])), None);
        }
    }

    #[test]
    fn records_that_no_longer_answer_are_deleted() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join("servers");
        for port in [4200, 4000, 4100] {
            write(&dir, &record(port)).unwrap();
        }
        std::fs::write(dir.join("junk.json"), "not json").unwrap();

        let live = running(&dir, |port| port != 4100);
        assert_eq!(live, vec![record(4000), record(4200)]);
        assert!(!dir.join("4100.json").exists(), "a dead record is deleted");
        assert!(dir.join("4000.json").exists());

        remove(&dir, 4000);
        assert_eq!(running(&dir, |_| true), vec![record(4200)]);
        assert!(running(&tmp.path().join("missing"), |_| true).is_empty());
    }

    #[test]
    fn the_target_is_the_named_port_or_the_only_server() {
        assert_eq!(target(Some(4300), &[record(4000), record(4200)], 4000), Target::Port(4300));
        assert_eq!(target(None, &[record(4200)], 4000), Target::Port(4200));
        assert_eq!(target(None, &[], 4000), Target::Port(4000));
        assert_eq!(
            target(None, &[record(4000), record(4200)], 4000),
            Target::Many(vec![record(4000), record(4200)])
        );
    }
}

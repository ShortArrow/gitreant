//! Persistent per-repository commit counts: the denominator of the
//! estimated analysis percentage. Persisted so the estimate is available
//! from the first read after a server restart.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub struct CountCache {
    file: Option<PathBuf>,
    counts: Mutex<HashMap<String, usize>>,
}

impl CountCache {
    /// Load the cache stored under `dir`; a missing or unreadable file is
    /// an empty cache, and `None` keeps the cache memory-only.
    pub fn load(dir: Option<&Path>) -> Self {
        let file = dir.map(|dir| dir.join("commit-counts.json"));
        let counts = file.as_deref().and_then(read_counts).unwrap_or_default();
        Self {
            file,
            counts: Mutex::new(counts),
        }
    }

    /// The commit count of `id`'s last successful read, if known.
    pub fn get(&self, id: &str) -> Option<usize> {
        self.counts.lock().expect("counts mutex").get(id).copied()
    }

    /// Merge fresh counts and persist them (best effort).
    pub fn update(&self, fresh: impl IntoIterator<Item = (String, usize)>) {
        let mut counts = self.counts.lock().expect("counts mutex");
        counts.extend(fresh);
        let Some(file) = &self.file else {
            return;
        };
        if let Some(dir) = file.parent() {
            let _ = fs::create_dir_all(dir);
        }
        if let Ok(json) = serde_json::to_string(&*counts) {
            let _ = fs::write(file, json);
        }
    }
}

fn read_counts(file: &Path) -> Option<HashMap<String, usize>> {
    serde_json::from_str(&fs::read_to_string(file).ok()?).ok()
}

/// Where gitreant keeps per-user state: `GITREANT_STATE_DIR` when set,
/// else the platform's local data directory.
pub fn state_dir() -> Option<PathBuf> {
    if let Some(dir) = std::env::var_os("GITREANT_STATE_DIR") {
        return Some(PathBuf::from(dir));
    }
    #[cfg(windows)]
    let base = std::env::var_os("LOCALAPPDATA").map(PathBuf::from);
    #[cfg(not(windows))]
    let base = std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".local/share")));
    base.map(|base| base.join("gitreant"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_survive_a_reload_from_the_same_directory() {
        let tmp = tempfile::tempdir().unwrap();

        let cache = CountCache::load(Some(tmp.path()));
        assert_eq!(cache.get("/repos/a"), None);
        cache.update([("/repos/a".to_string(), 1200)]);
        assert_eq!(cache.get("/repos/a"), Some(1200));

        // A new instance — a restarted server — sees the stored value.
        let reloaded = CountCache::load(Some(tmp.path()));
        assert_eq!(reloaded.get("/repos/a"), Some(1200));
    }

    #[test]
    fn updates_merge_instead_of_replacing() {
        let tmp = tempfile::tempdir().unwrap();
        let cache = CountCache::load(Some(tmp.path()));
        cache.update([("/repos/a".to_string(), 10)]);
        cache.update([("/repos/b".to_string(), 20)]);

        let reloaded = CountCache::load(Some(tmp.path()));
        assert_eq!(reloaded.get("/repos/a"), Some(10));
        assert_eq!(reloaded.get("/repos/b"), Some(20));
    }

    #[test]
    fn a_broken_cache_file_is_an_empty_cache() {
        let tmp = tempfile::tempdir().unwrap();
        fs::write(tmp.path().join("commit-counts.json"), "not json").unwrap();
        let cache = CountCache::load(Some(tmp.path()));
        assert_eq!(cache.get("/repos/a"), None);
    }

    #[test]
    fn a_memory_only_cache_works_without_a_directory() {
        let cache = CountCache::load(None);
        cache.update([("/repos/a".to_string(), 5)]);
        assert_eq!(cache.get("/repos/a"), Some(5));
    }
}

//! Adapter over `gix` that reads a local repository into plain data the rest of
//! the app can consume. Isolates the (evolving) gitoxide API from the domain.

mod detail;
mod fetch;
mod repo;

pub use detail::{
    read_commit, read_commit_diff, read_file_diff, CommitDetail, FileChange, FileDiff,
};
pub use fetch::{fetch_command, fetch_remotes};
pub use repo::{discover_repo, read_repo, CommitMeta, RefInfo, RepoData};

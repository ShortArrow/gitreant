//! Adapter over `gix` that reads a local repository into plain data the rest of
//! the app can consume. Isolates the (evolving) gitoxide API from the domain.

mod detail;
mod repo;

pub use detail::{read_commit, CommitDetail, FileChange};
pub use repo::{discover_repo, read_repo, CommitMeta, RefInfo, RepoData};

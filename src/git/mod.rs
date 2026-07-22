//! Adapter over `gix` that reads a local repository into plain data the rest of
//! the app can consume. Isolates the (evolving) gitoxide API from the domain.

mod branch;
mod detail;
mod fetch;
mod prs;
mod repo;
mod status;
mod tag;
mod verify;

pub use branch::{
    checkout, checkout_command, create_branch, create_branch_command, merge, merge_command,
};
pub use detail::{
    read_commit, read_commit_diff, read_file_diff, CommitDetail, FileChange, FileDiff,
};
pub use fetch::{fetch_command, fetch_remotes, tag_remotes, RemoteTagList};
pub use prs::{
    gh_available, list_merged_prs, list_prs, merged_pr_command, pr_command, MergedPullRequest,
    PullRequest,
};
pub use repo::{
    discover_repo, github_web_url, read_repo, read_repo_with_progress, CommitMeta, RefInfo,
    RepoData,
};
pub use status::{read_status, RepoStatus};
pub use tag::{create_tag, create_tag_command, delete_tag, delete_tag_command};
pub use verify::{
    gpg_available, verification_state, verify_command, verify_signatures, SignatureCheck,
};

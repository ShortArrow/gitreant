//! Application layer: manages the set of repositories on display and builds the
//! serializable views the API returns. Depends on the domain and git layers only.

mod session;
mod view;

pub use session::{
    canonical, count_batch, counted, read_view, verified, verify_batch, Added, CountedCommit,
    ExecutedCommand, Pending, Session, VerifiedCommit, Via,
};
pub use view::{
    build_view, CommitDetailView, CommitStat, CommitView, FileChangeView, FileDiffView, RefView,
    RepoView, WorktreeView,
};

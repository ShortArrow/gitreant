//! Application layer: manages the set of repositories on display and builds the
//! serializable views the API returns. Depends on the domain and git layers only.

mod session;
mod view;

pub use session::{
    canonical, count_batch, read_view, verify_batch, Added, ExecutedCommand, Pending, Session, Via,
};
pub use view::{
    build_view, CommitDetailView, CommitStat, CommitView, FileChangeView, FileDiffView, RefView, RepoView,
    WorktreeView,
};

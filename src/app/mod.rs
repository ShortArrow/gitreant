//! Application layer: manages the set of repositories on display and builds the
//! serializable views the API returns. Depends on the domain and git layers only.

mod session;
mod view;

pub use session::{canonical, read_views, ExecutedCommand, ReadProgress, Session};
pub use view::{
    build_view, CommitDetailView, CommitView, FileChangeView, FileDiffView, RefView, RepoView,
};

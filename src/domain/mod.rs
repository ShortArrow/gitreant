//! Pure domain model for commit-graph layout. No external I/O.

mod graph;

pub use graph::{layout, CommitInput, Graph, GraphEdge, GraphNode};

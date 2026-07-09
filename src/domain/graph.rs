//! Commit-graph lane layout: the "railroad" algorithm that assigns each commit a
//! column (lane) and derives the edges connecting commits to their parents.
//!
//! The input is a list of commits in topological order (a child always appears
//! before its parents, i.e. newest first). The output is purely positional data
//! (`row`, `lane`, `color`) that a frontend can render as SVG without any further
//! graph knowledge.

use serde::Serialize;

/// A commit reduced to what the layout algorithm needs: its identity and parents.
#[derive(Debug, Clone)]
pub struct CommitInput {
    pub id: String,
    pub parents: Vec<String>,
}

/// A commit placed on the grid.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct GraphNode {
    pub id: String,
    /// Vertical position (index in the topological order).
    pub row: usize,
    /// Horizontal position (column).
    pub lane: usize,
    /// Stable color index for the branch this commit sits on.
    pub color: usize,
    pub parents: Vec<String>,
}

/// A link from a commit (`from`) to one of its parents (`to`).
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct GraphEdge {
    pub from: String,
    pub to: String,
    pub from_lane: usize,
    pub to_lane: usize,
    /// Color of the branch this edge belongs to: the child's branch for
    /// first-parent edges, the merged branch for further (merge) parents.
    pub color: usize,
}

/// The laid-out graph ready for rendering.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Graph {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
    /// Number of columns the graph spans (its visual width).
    pub lane_count: usize,
}

/// Assign lanes and colors to `commits`, which must be in topological order
/// (child before parents).
///
/// Invariant the renderer relies on: once a pending parent is assigned a lane,
/// that lane stays reserved until the parent itself is placed. Edges to that
/// parent can therefore run vertically along `to_lane` across all intermediate
/// rows without colliding with any node.
pub fn layout(commits: &[CommitInput]) -> Graph {
    let mut state = LayoutState::default();
    let mut nodes = Vec::with_capacity(commits.len());
    let mut edges = Vec::new();

    for (row, commit) in commits.iter().enumerate() {
        let my_lane = state.lane_for(&commit.id);
        let my_color = state.colors[my_lane];

        nodes.push(GraphNode {
            id: commit.id.clone(),
            row,
            lane: my_lane,
            color: my_color,
            parents: commit.parents.clone(),
        });

        if commit.parents.is_empty() {
            state.free(my_lane);
        } else {
            for (index, parent) in commit.parents.iter().enumerate() {
                let is_first = index == 0;
                let target_lane = state.route_to_parent(parent, my_lane, is_first);
                edges.push(GraphEdge {
                    from: commit.id.clone(),
                    to: parent.clone(),
                    from_lane: my_lane,
                    to_lane: target_lane,
                    color: if is_first {
                        my_color
                    } else {
                        state.colors[target_lane]
                    },
                });
            }
        }
    }

    Graph {
        nodes,
        edges,
        lane_count: state.lanes.len(),
    }
}

/// Mutable bookkeeping while laying out the graph.
///
/// `lanes[i]` holds the commit id currently expected next in column `i`, or
/// `None` when the column is free. `colors[i]` is the branch color of that
/// column. Freed columns are reused to keep the graph compact; `lanes` only ever
/// grows, so its final length equals the maximum simultaneous width.
#[derive(Default)]
struct LayoutState {
    lanes: Vec<Option<String>>,
    colors: Vec<usize>,
    next_color: usize,
}

impl LayoutState {
    /// The column this commit occupies. If no column was reserved for it, this is
    /// a branch tip (or an unreferenced commit) and gets a fresh column + color.
    fn lane_for(&mut self, id: &str) -> usize {
        match self.find(id) {
            Some(idx) => idx,
            None => {
                let idx = self.alloc();
                self.colors[idx] = self.take_color();
                self.lanes[idx] = Some(id.to_string());
                idx
            }
        }
    }

    /// Reserve a column for `parent` and return it. The first parent continues in
    /// the child's column (or merges into a column already reserved for it); any
    /// further (merge) parent takes its own column.
    fn route_to_parent(&mut self, parent: &str, my_lane: usize, is_first: bool) -> usize {
        if let Some(existing) = self.find(parent) {
            if is_first && existing != my_lane {
                // The child's column converges into the parent's existing column.
                self.free(my_lane);
            }
            return existing;
        }
        if is_first {
            self.lanes[my_lane] = Some(parent.to_string());
            my_lane
        } else {
            let idx = self.alloc();
            self.colors[idx] = self.take_color();
            self.lanes[idx] = Some(parent.to_string());
            idx
        }
    }

    fn find(&self, id: &str) -> Option<usize> {
        self.lanes.iter().position(|l| l.as_deref() == Some(id))
    }

    fn free(&mut self, lane: usize) {
        self.lanes[lane] = None;
    }

    /// Reuse the lowest free column, or grow by one.
    fn alloc(&mut self) -> usize {
        match self.lanes.iter().position(|l| l.is_none()) {
            Some(idx) => idx,
            None => {
                self.lanes.push(None);
                self.colors.push(0);
                self.lanes.len() - 1
            }
        }
    }

    fn take_color(&mut self) -> usize {
        let c = self.next_color;
        self.next_color += 1;
        c
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ci(id: &str, parents: &[&str]) -> CommitInput {
        CommitInput {
            id: id.to_string(),
            parents: parents.iter().map(|s| s.to_string()).collect(),
        }
    }

    #[test]
    fn empty_history_is_empty_graph() {
        let g = layout(&[]);
        assert!(g.nodes.is_empty());
        assert!(g.edges.is_empty());
        assert_eq!(g.lane_count, 0);
    }

    #[test]
    fn single_root_commit() {
        let g = layout(&[ci("A", &[])]);
        assert_eq!(g.nodes.len(), 1);
        assert_eq!(g.nodes[0].row, 0);
        assert_eq!(g.nodes[0].lane, 0);
        assert_eq!(g.nodes[0].color, 0);
        assert!(g.edges.is_empty());
        assert_eq!(g.lane_count, 1);
    }

    #[test]
    fn linear_history_stays_in_one_lane() {
        // A -> B -> C, newest first.
        let g = layout(&[ci("A", &["B"]), ci("B", &["C"]), ci("C", &[])]);

        assert_eq!(g.lane_count, 1);
        for (row, node) in g.nodes.iter().enumerate() {
            assert_eq!(node.row, row);
            assert_eq!(node.lane, 0);
            assert_eq!(node.color, 0);
        }
        assert_eq!(g.edges.len(), 2);
        assert_eq!(g.edges[0].from, "A");
        assert_eq!(g.edges[0].to, "B");
        assert_eq!((g.edges[0].from_lane, g.edges[0].to_lane), (0, 0));
    }

    #[test]
    fn branch_and_merge_uses_two_lanes() {
        // M merges A and B, both forked from Base.
        //   M    parents [A, B]
        //   B    parent  [Base]
        //   A    parent  [Base]
        //   Base root
        let g = layout(&[
            ci("M", &["A", "B"]),
            ci("B", &["Base"]),
            ci("A", &["Base"]),
            ci("Base", &[]),
        ]);

        assert_eq!(g.lane_count, 2);

        let lane_of = |id: &str| g.nodes.iter().find(|n| n.id == id).unwrap().lane;
        assert_eq!(lane_of("M"), 0);
        assert_eq!(lane_of("A"), 0); // first parent continues in the merge commit's lane
        assert_eq!(lane_of("B"), 1); // second parent takes a fresh lane
        assert_eq!(lane_of("Base"), 1);

        // The merge commit has one edge to each parent, on distinct target lanes.
        let m_edges: Vec<_> = g.edges.iter().filter(|e| e.from == "M").collect();
        assert_eq!(m_edges.len(), 2);
        assert_eq!(m_edges[0].to_lane, 0);
        assert_eq!(m_edges[1].to_lane, 1);

        // A's first parent Base is already reserved in lane 1, so A converges there.
        let a_edge = g.edges.iter().find(|e| e.from == "A").unwrap();
        assert_eq!((a_edge.from_lane, a_edge.to_lane), (0, 1));
    }

    #[test]
    fn fork_edge_keeps_the_child_branch_color() {
        // Same topology as branch_and_merge_uses_two_lanes: A (main, color 0)
        // converges into Base, which sits in B's lane (color 1). That segment
        // is main's own line, so it must keep main's color instead of
        // switching to the lane it converges into.
        let g = layout(&[
            ci("M", &["A", "B"]),
            ci("B", &["Base"]),
            ci("A", &["Base"]),
            ci("Base", &[]),
        ]);

        let a_edge = g.edges.iter().find(|e| e.from == "A").unwrap();
        assert_eq!(a_edge.color, 0);

        // Merge edges still carry the merged branch's color.
        let merge_edge = g.edges.iter().find(|e| e.from == "M" && e.to == "B").unwrap();
        assert_eq!(merge_edge.color, 1);
    }

    #[test]
    fn freed_lane_is_reused_to_stay_compact() {
        // A side branch that ends (root) frees its lane; a later independent tip
        // should reuse lane 1 rather than growing to lane 2.
        //   A    parent [C]
        //   B    parent []      (independent root, occupies a temporary 2nd lane)
        //   C    parent []
        //   D    parent []      (new independent tip -> should reuse a freed lane)
        let g = layout(&[
            ci("A", &["C"]),
            ci("B", &[]),
            ci("C", &[]),
            ci("D", &[]),
        ]);
        // At most two lanes are ever simultaneously active.
        assert!(g.lane_count <= 2, "expected compact layout, got {}", g.lane_count);
    }
}

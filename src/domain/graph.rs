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
    /// A lane-crossing first-parent edge: it runs vertically in the child's
    /// own lane and bends at the parent (fork point). Merge edges bend at
    /// the merge commit instead.
    pub fork: bool,
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
/// Two principles keep the picture readable: the checked-out branch (`head`'s
/// first-parent chain, the "spine") pins column 0 as a straight line, and
/// merge parents never take a column left of the merge commit — branches fork
/// to the right, merges come back from the right.
///
/// Invariant the renderer relies on: once a pending parent is assigned a lane,
/// that lane stays reserved until the parent itself is placed. Edges to that
/// parent can therefore run vertically along `to_lane` across all intermediate
/// rows without colliding with any node.
pub fn layout(commits: &[CommitInput], head: Option<&str>) -> Graph {
    let spine = spine_of(commits, head);
    let mut state = LayoutState::default();
    if let Some(head_id) = head.filter(|h| spine.contains(*h)) {
        // Reserve the spine's column up front so nothing else takes lane 0.
        let idx = state.alloc_after(None);
        state.colors[idx] = state.take_color();
        state.lanes[idx] = Some(head_id.to_string());
        // Nothing has drawn into this column yet, so the first child of the
        // head may adopt it and run straight down the left edge.
        state.adoptable = Some(idx);
    }
    let mut nodes = Vec::with_capacity(commits.len());
    let mut edges = Vec::new();

    for (row, commit) in commits.iter().enumerate() {
        // Lanes held for fork corridors down to this commit free up now.
        state.release_holds(&commit.id);
        let my_lane = state.lane_for(&commit.id, commit.parents.first().map(String::as_str));
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
                let target_lane = state.route_to_parent(
                    parent,
                    my_lane,
                    is_first,
                    spine.contains(parent.as_str()),
                );
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
                    fork: is_first && target_lane != my_lane,
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

/// The ids on `head`'s first-parent chain, as far as it stays inside
/// `commits`. Empty when there is no head (or it is not displayed).
fn spine_of(commits: &[CommitInput], head: Option<&str>) -> std::collections::HashSet<String> {
    use std::collections::{HashMap, HashSet};
    let first_parent: HashMap<&str, &str> = commits
        .iter()
        .filter_map(|c| c.parents.first().map(|p| (c.id.as_str(), p.as_str())))
        .collect();
    let ids: HashSet<&str> = commits.iter().map(|c| c.id.as_str()).collect();

    let mut spine = HashSet::new();
    let mut current = head;
    while let Some(id) = current {
        if !ids.contains(id) || !spine.insert(id.to_string()) {
            break;
        }
        current = first_parent.get(id).copied();
    }
    spine
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
    /// A pre-reserved column with no edge drawn into it yet; the first tip
    /// whose first parent is its pending commit may adopt it (and then it is
    /// no longer open).
    adoptable: Option<usize>,
}

impl LayoutState {
    /// The column this commit occupies. An unreserved commit is a branch tip
    /// (or unreferenced): it adopts an open pre-reserved column when its
    /// first parent is that column's pending commit, otherwise it gets a
    /// fresh column + color.
    fn lane_for(&mut self, id: &str, first_parent: Option<&str>) -> usize {
        if let Some(idx) = self.find(id) {
            if self.adoptable == Some(idx) {
                // The reserved commit itself arrived; the column is closed.
                self.adoptable = None;
            }
            return idx;
        }
        if let (Some(idx), Some(parent)) = (self.adoptable, first_parent) {
            if self.lanes[idx].as_deref() == Some(parent) {
                // Ride the open column: the edge down to the pending parent
                // stays dead straight along the left edge.
                self.adoptable = None;
                return idx;
            }
        }
        let idx = self.alloc_after(None);
        self.colors[idx] = self.take_color();
        self.lanes[idx] = Some(id.to_string());
        idx
    }

    /// Reserve a column for `parent` and return it. The first parent continues
    /// in the child's column (or converges into a column already reserved for
    /// it); a spine parent always lives in column 0; any further (merge)
    /// parent takes a fresh column right of the merge commit.
    fn route_to_parent(
        &mut self,
        parent: &str,
        my_lane: usize,
        is_first: bool,
        parent_on_spine: bool,
    ) -> usize {
        if let Some(existing) = self.find(parent) {
            if is_first && existing != my_lane {
                // A fork: the edge runs vertically down the child's own
                // column, so hold it until the parent is placed.
                self.hold(my_lane, parent);
            }
            return existing;
        }
        if parent_on_spine {
            // Column 0 belongs to the spine. Only the spine itself hands the
            // reservation down; other children fork into it and hold their
            // column for the edge's vertical run.
            if is_first && my_lane == 0 {
                self.lanes[0] = Some(parent.to_string());
            } else if is_first {
                self.hold(my_lane, parent);
            }
            return 0;
        }
        if is_first {
            self.lanes[my_lane] = Some(parent.to_string());
            my_lane
        } else {
            // Merges come back from the right: never left of the merge commit.
            let idx = self.alloc_after(Some(my_lane));
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

    /// Keep `lane` occupied for a fork edge's vertical run until `parent` is
    /// placed. The "hold:" prefix cannot collide with (hex) commit ids.
    fn hold(&mut self, lane: usize, parent: &str) {
        self.lanes[lane] = Some(format!("hold:{parent}"));
    }

    /// Free every lane held for fork edges ending at `id`.
    fn release_holds(&mut self, id: &str) {
        let key = format!("hold:{id}");
        for lane in self.lanes.iter_mut() {
            if lane.as_deref() == Some(key.as_str()) {
                *lane = None;
            }
        }
    }

    /// Reuse the lowest free column (strictly right of `after`, when given),
    /// or grow by one.
    fn alloc_after(&mut self, after: Option<usize>) -> usize {
        let start = after.map_or(0, |lane| lane + 1);
        match self
            .lanes
            .iter()
            .enumerate()
            .position(|(i, l)| i >= start && l.is_none())
        {
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
        let g = layout(&[], None);
        assert!(g.nodes.is_empty());
        assert!(g.edges.is_empty());
        assert_eq!(g.lane_count, 0);
    }

    #[test]
    fn single_root_commit() {
        let g = layout(&[ci("A", &[])], None);
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
        let g = layout(&[ci("A", &["B"]), ci("B", &["C"]), ci("C", &[])], None);

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
        let g = layout(
            &[
                ci("M", &["A", "B"]),
                ci("B", &["Base"]),
                ci("A", &["Base"]),
                ci("Base", &[]),
            ],
            None,
        );

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
        let g = layout(
            &[
                ci("M", &["A", "B"]),
                ci("B", &["Base"]),
                ci("A", &["Base"]),
                ci("Base", &[]),
            ],
            None,
        );

        let a_edge = g.edges.iter().find(|e| e.from == "A").unwrap();
        assert_eq!(a_edge.color, 0);

        // Merge edges still carry the merged branch's color.
        let merge_edge = g.edges.iter().find(|e| e.from == "M" && e.to == "B").unwrap();
        assert_eq!(merge_edge.color, 1);
    }

    #[test]
    fn merge_parents_take_lanes_right_of_the_merge_commit() {
        // Lane 0 frees before the merge commit A (lane 1) routes its second
        // parent C. Reusing the freed lane would draw the merge coming from
        // the LEFT; the principle is: branches fork right, merges come back
        // from the right.
        //   T  [X, A]
        //   X  []        (root: frees lane 0)
        //   A  [B, C]    (in lane 1; C must NOT take the freed lane 0)
        //   B  []
        //   C  []
        let g = layout(
            &[
                ci("T", &["X", "A"]),
                ci("X", &[]),
                ci("A", &["B", "C"]),
                ci("B", &[]),
                ci("C", &[]),
            ],
            None,
        );

        let lane_of = |id: &str| g.nodes.iter().find(|n| n.id == id).unwrap().lane;
        assert_eq!(lane_of("A"), 1);
        assert!(
            lane_of("C") > lane_of("A"),
            "merge parent went left: C={} A={}",
            lane_of("C"),
            lane_of("A")
        );
        let merge_edge = g.edges.iter().find(|e| e.from == "A" && e.to == "C").unwrap();
        assert!(merge_edge.to_lane > merge_edge.from_lane);
    }

    #[test]
    fn the_head_first_parent_chain_pins_lane_zero() {
        // The checked-out branch (M -> Base) must form the straight left
        // spine even when another branch tip is newer; the newer tip forks
        // to the right and converges into the spine.
        //   F    [Base]   (newer tip of an unmerged branch)
        //   M    [Base]   (HEAD)
        //   Base []
        let g = layout(
            &[ci("F", &["Base"]), ci("M", &["Base"]), ci("Base", &[])],
            Some("M"),
        );

        let lane_of = |id: &str| g.nodes.iter().find(|n| n.id == id).unwrap().lane;
        assert_eq!(lane_of("M"), 0);
        assert_eq!(lane_of("Base"), 0);
        assert_eq!(lane_of("F"), 1);

        // F's fork edge converges into the spine from the right.
        let f_edge = g.edges.iter().find(|e| e.from == "F").unwrap();
        assert_eq!((f_edge.from_lane, f_edge.to_lane), (1, 0));
    }

    #[test]
    fn the_first_child_above_head_adopts_the_spine_lane_and_runs_straight() {
        // O sits above the checked-out H with H as its first parent, and
        // nothing has drawn into H's pre-reserved column yet — so O adopts
        // column 0 and its edge is dead straight. The later child G1 finds
        // the column taken and bends in as usual.
        //   O   [H]     (newest tip, first parent = HEAD)
        //   G2  [G1]
        //   G1  [H]     (second child: must NOT adopt)
        //   H   [Root]  (HEAD)
        //   Root []
        let g = layout(
            &[
                ci("O", &["H"]),
                ci("G2", &["G1"]),
                ci("G1", &["H"]),
                ci("H", &["Root"]),
                ci("Root", &[]),
            ],
            Some("H"),
        );

        let lane_of = |id: &str| g.nodes.iter().find(|n| n.id == id).unwrap().lane;
        assert_eq!(lane_of("O"), 0, "first child adopts the spine lane");
        assert_eq!(lane_of("H"), 0);
        let o_edge = g.edges.iter().find(|e| e.from == "O").unwrap();
        assert_eq!(
            (o_edge.from_lane, o_edge.to_lane),
            (0, 0),
            "the leftmost line runs straight"
        );
        assert_ne!(lane_of("G1"), 0, "later children fork in from the side");
        let g1_edge = g.edges.iter().find(|e| e.from == "G1").unwrap();
        assert!(g1_edge.fork);
    }

    #[test]
    fn fork_edges_bend_at_the_parent_and_hold_their_lane() {
        // A converges into Base: its edge is a fork (drawn vertically in A's
        // own lane, bending at Base), so A's lane must stay reserved until
        // Base is placed — the tip D two rows below must NOT reuse it.
        //   M    [A, B]
        //   B    [Base]
        //   A    [Base]
        //   D    []       (independent tip between A and Base)
        //   Base []
        let g = layout(
            &[
                ci("M", &["A", "B"]),
                ci("B", &["Base"]),
                ci("A", &["Base"]),
                ci("D", &[]),
                ci("Base", &[]),
            ],
            None,
        );

        let a_edge = g.edges.iter().find(|e| e.from == "A").unwrap();
        assert!(a_edge.fork, "convergence edge must be marked as a fork");
        let m_first = g.edges.iter().find(|e| e.from == "M" && e.to == "A").unwrap();
        assert!(!m_first.fork, "same-lane first-parent edge is not a fork");
        let merge_edge = g.edges.iter().find(|e| e.from == "M" && e.to == "B").unwrap();
        assert!(!merge_edge.fork, "merge edges bend at the merge commit");

        // D must not sit in A's held lane (0): the corridor stays free for
        // A's vertical run down to Base.
        let lane_of = |id: &str| g.nodes.iter().find(|n| n.id == id).unwrap().lane;
        assert_eq!(lane_of("A"), 0);
        assert_ne!(lane_of("D"), 0, "held fork lane was reused too early");
    }

    #[test]
    fn freed_lane_is_reused_to_stay_compact() {
        // A side branch that ends (root) frees its lane; a later independent tip
        // should reuse lane 1 rather than growing to lane 2.
        //   A    parent [C]
        //   B    parent []      (independent root, occupies a temporary 2nd lane)
        //   C    parent []
        //   D    parent []      (new independent tip -> should reuse a freed lane)
        let g = layout(
            &[ci("A", &["C"]), ci("B", &[]), ci("C", &[]), ci("D", &[])],
            None,
        );
        // At most two lanes are ever simultaneously active.
        assert!(g.lane_count <= 2, "expected compact layout, got {}", g.lane_count);
    }
}

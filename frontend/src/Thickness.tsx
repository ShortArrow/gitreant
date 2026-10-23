import { type CommitView, type GraphEdge, UNCOMMITTED_ID } from "./api";
import { edgeBetween, NODE_RADIUS, nodeX, nodeY } from "./graph";
import { edgeLayers, nodeLayers, type Side } from "./thicknessModel";

const SIDES: Side[] = ["added", "deleted"];

/**
 * The thickness of the rows' graph (ADR 0044): behind each counted commit,
 * copies of its node and edges stacked up and to the left by the lines it
 * added and down and to the right by the lines it deleted, as an
 * illustration tool's blend fakes a solid's depth. Each side is drawn as
 * one see-through shape in green or red: its copies merge instead of
 * darkening where they overlap. An edge's copies are as wide as a node, so
 * a fin reaches as far as the pillars at its ends.
 */
export function Thickness({
  commits,
  edges,
  rowOf,
  fadedNode,
  fadedEdge,
}: {
  commits: CommitView[];
  edges: GraphEdge[];
  rowOf: Map<string, number>;
  fadedNode: (id: string) => string;
  fadedEdge: (edge: GraphEdge) => string | undefined;
}) {
  const statOf = new Map(commits.map((c) => [c.id, c.stat]));
  const drawn = edges.flatMap((edge) => {
    const childRow = rowOf.get(edge.from);
    const parentRow = rowOf.get(edge.to);
    if (
      edge.dashed ||
      edge.from === UNCOMMITTED_ID ||
      childRow === undefined ||
      parentRow === undefined
    ) {
      return [];
    }
    return [
      {
        edge,
        from: { x: nodeX(edge.from_lane), y: nodeY(childRow) },
        to: { x: nodeX(edge.to_lane), y: nodeY(parentRow) },
        layers: edgeLayers(statOf.get(edge.from), statOf.get(edge.to)),
      },
    ];
  });
  return (
    <g className="thickness" data-testid="thickness">
      {SIDES.map((side) => (
        <g
          key={side}
          className={`thickness-side thickness-${side}`}
          data-side={side}
        >
          {drawn.map(({ edge, from, to, layers }, i) => (
            <g key={`te${i}`} className={fadedEdge(edge)}>
              {layers
                .filter((layer) => layer.kind === side)
                .map((layer, j) => (
                  <path
                    key={j}
                    d={edgeBetween(
                      edge,
                      { x: from.x + layer.from.x, y: from.y + layer.from.y },
                      { x: to.x + layer.to.x, y: to.y + layer.to.y },
                    )}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2 * NODE_RADIUS}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}
            </g>
          ))}
          {commits.map((commit) => {
            const layers = nodeLayers(commit.stat).filter(
              (layer) => layer.kind === side,
            );
            if (layers.length === 0) return null;
            const x = nodeX(commit.lane);
            const y = nodeY(commit.row);
            return (
              <g
                key={commit.id}
                className={`thickness-node${fadedNode(commit.id)}`}
                data-testid="thickness-node"
                data-commit={commit.id}
                data-side={side}
              >
                {layers.map((layer, j) => (
                  <circle
                    key={j}
                    cx={x + layer.dx}
                    cy={y + layer.dy}
                    r={NODE_RADIUS}
                    fill="currentColor"
                  />
                ))}
              </g>
            );
          })}
        </g>
      ))}
    </g>
  );
}

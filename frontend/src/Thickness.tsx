import { useId, useSyncExternalStore } from "react";
import { type CommitView, type GraphEdge, UNCOMMITTED_ID } from "./api";
import { edgeBetween, NODE_RADIUS, nodeX, nodeY } from "./graph";
import {
  byLane,
  edgeLayers,
  nodeLayers,
  type Side,
  spansRows,
} from "./thicknessModel";
import type { ThicknessView } from "./thicknessView";
import { useThicknessOutline } from "./settings";

/**
 * One side of the thickness of the rows' graph (ADR 0044): behind or in
 * front of each counted commit, copies of its node and edges stacked up and
 * to the left by the lines it added, or down and to the right by the lines
 * it deleted, as an illustration tool's blend fakes a solid's depth;
 * dragging the graph's background tilts that direction and depth
 * (ADR 0045). Each lane's copies are drawn as one see-through shape in green
 * or red, merging instead of darkening where they overlap, with an outline
 * in a deeper shade; the lanes are drawn left to right, so a lane's shape
 * covers the outlines of those left of it (ADR 0058). An edge's copies are
 * as wide as a node, so a fin reaches as far as the pillars at its ends, and
 * fainter, so the pillars stand out. Only the commits and edges on the
 * view's rows are drawn, so a long history stays quick to draw and to tilt.
 */
export function Thickness({
  side,
  commits,
  edges,
  rowOf,
  fadedNode,
  fadedEdge,
  view,
}: {
  side: Side;
  commits: CommitView[];
  edges: GraphEdge[];
  rowOf: Map<string, number>;
  fadedNode: (id: string) => string;
  fadedEdge: (edge: GraphEdge) => string | undefined;
  /** The tilt and the rows to draw, followed without redrawing the card. */
  view: ThicknessView;
}) {
  const { tilt, rows } = useSyncExternalStore(view.subscribe, view.get);
  const outline = `thickness-outline-${useId().replace(/[^\w-]/g, "")}`;
  const outlined = useThicknessOutline();
  const statOf = new Map(commits.map((c) => [c.id, c.stat]));
  const pillars = commits.flatMap((commit) => {
    if (commit.row < rows.first || commit.row > rows.last) return [];
    const layers = nodeLayers(commit.stat, tilt).filter(
      (layer) => layer.kind === side,
    );
    return layers.length === 0 ? [] : [{ commit, lane: commit.lane, layers }];
  });
  const fins = edges.flatMap((edge) => {
    const childRow = rowOf.get(edge.from);
    const parentRow = rowOf.get(edge.to);
    if (
      edge.dashed ||
      edge.from === UNCOMMITTED_ID ||
      childRow === undefined ||
      parentRow === undefined ||
      !spansRows(childRow, parentRow, rows)
    ) {
      return [];
    }
    const layers = edgeLayers(
      statOf.get(edge.from),
      statOf.get(edge.to),
      tilt,
    ).filter((layer) => layer.kind === side);
    if (layers.length === 0) return [];
    return [
      {
        edge,
        from: { x: nodeX(edge.from_lane), y: nodeY(childRow) },
        to: { x: nodeX(edge.to_lane), y: nodeY(parentRow) },
        layers,
      },
    ];
  });
  return (
    <g className="thickness" data-testid="thickness">
      <g className={`thickness-side thickness-${side}`} data-side={side}>
        {outlined && (
          <filter id={outline}>
            <feComponentTransfer in="SourceAlpha" result="shape">
              <feFuncA type="linear" slope={100} />
            </feComponentTransfer>
            <feMorphology
              in="shape"
              operator="dilate"
              radius={1}
              result="grown"
            />
            <feComposite in="grown" in2="shape" operator="out" result="ring" />
            <feFlood className="thickness-outline" result="ink" />
            <feComposite in="ink" in2="ring" operator="in" result="edge" />
            <feMerge>
              <feMergeNode in="SourceGraphic" />
              <feMergeNode in="edge" />
            </feMerge>
          </filter>
        )}
        {byLane(pillars, fins).map((lane) => (
          <g
            key={lane.lane}
            className="thickness-lane"
            data-lane={lane.lane}
            filter={outlined ? `url(#${outline})` : undefined}
          >
            <g className="thickness-body">
              {lane.pillars.map(({ commit, layers }) => {
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
              <g className="thickness-fins">
                {lane.fins.map(({ edge, from, to, layers }, i) => (
                  <g key={`te${i}`} className={fadedEdge(edge)}>
                    {layers.map((layer, j) => (
                      <path
                        key={j}
                        d={edgeBetween(
                          edge,
                          {
                            x: from.x + layer.from.x,
                            y: from.y + layer.from.y,
                          },
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
              </g>
            </g>
          </g>
        ))}
      </g>
    </g>
  );
}

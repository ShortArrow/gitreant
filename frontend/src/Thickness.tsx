import { useId, useSyncExternalStore } from "react";
import { type CommitView, type GraphEdge, UNCOMMITTED_ID } from "./api";
import { edgeBetween, NODE_RADIUS, nodeX, nodeY } from "./graph";
import {
  byLane,
  edgeLayers,
  type LaneThickness,
  nodeLayers,
  type Side,
  spansRows,
} from "./thicknessModel";
import type { ThicknessView } from "./thicknessView";
import { useThicknessOutline } from "./settings";

type Pillar = {
  commit: CommitView;
  lane: number;
  layers: ReturnType<typeof nodeLayers>;
};

type Fin = {
  edge: GraphEdge;
  from: { x: number; y: number };
  to: { x: number; y: number };
  layers: ReturnType<typeof edgeLayers>;
};

const OTHER: Record<Side, Side> = { added: "deleted", deleted: "added" };

/**
 * One side of the thickness of the rows' graph (ADR 0044): behind or in
 * front of each counted commit, copies of its node and edges stacked up and
 * to the left by the lines it added, or down and to the right by the lines
 * it deleted, as an illustration tool's blend fakes a solid's depth;
 * dragging the graph's background tilts that direction and depth
 * (ADR 0045). Each lane's copies are drawn as one see-through shape in green
 * or red, merging instead of darkening where they overlap; the lanes are
 * drawn left to right, so a lane's shape covers the outlines of those left
 * of it (ADR 0058). An outline, when set, follows a lane's two sides as one
 * shape: each side outlines only its part of that shape's border, in its
 * own deeper shade (ADR 0065). An edge's copies are as wide as a node, so a
 * fin reaches as far as the pillars at its ends, and fainter, so the
 * pillars stand out. Only the commits and edges on the view's rows are
 * drawn, so a long history stays quick to draw and to tilt.
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
  const lanesOf = (of: Side): LaneThickness<Pillar, Fin>[] => {
    const pillars = commits.flatMap((commit) => {
      if (commit.row < rows.first || commit.row > rows.last) return [];
      const layers = nodeLayers(commit.stat, tilt).filter(
        (layer) => layer.kind === of,
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
      ).filter((layer) => layer.kind === of);
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
    return byLane(pillars, fins);
  };
  const lanes = lanesOf(side);
  const otherLanes = outlined
    ? new Map(lanesOf(OTHER[side]).map((lane) => [lane.lane, lane]))
    : new Map<number, LaneThickness<Pillar, Fin>>();
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
            <feComposite in="ink" in2="ring" operator="in" />
          </filter>
        )}
        {lanes.map((lane) => {
          const mask = `${outline}-lane${lane.lane}`;
          const other = otherLanes.get(lane.lane);
          return (
            <g key={lane.lane} className="thickness-lane" data-lane={lane.lane}>
              <g className="thickness-body">
                <LaneShape
                  lane={lane}
                  fadedNode={fadedNode}
                  fadedEdge={fadedEdge}
                  marked={side}
                />
              </g>
              {outlined && (
                <>
                  <mask id={mask} x="-50%" y="-50%" width="200%" height="200%">
                    <rect
                      x={-1e7}
                      y={-1e7}
                      width={2e7}
                      height={2e7}
                      fill="white"
                    />
                    {other && (
                      <g color="black">
                        <LaneShape lane={other} />
                      </g>
                    )}
                  </mask>
                  <g
                    className="thickness-ring"
                    filter={`url(#${outline})`}
                    mask={`url(#${mask})`}
                  >
                    <LaneShape lane={lane} />
                  </g>
                </>
              )}
            </g>
          );
        })}
      </g>
    </g>
  );
}

/**
 * A lane's pillars and fins on one side, filled with the current color.
 * `marked` names the side on the copies the graph's tests and pointer
 * tooling look up; the outline's and its mask's copies carry no marks
 * and no fading.
 */
function LaneShape({
  lane,
  fadedNode = () => "",
  fadedEdge = () => undefined,
  marked,
}: {
  lane: LaneThickness<Pillar, Fin>;
  fadedNode?: (id: string) => string;
  fadedEdge?: (edge: GraphEdge) => string | undefined;
  marked?: Side;
}) {
  return (
    <>
      {lane.pillars.map(({ commit, layers }) => {
        const x = nodeX(commit.lane);
        const y = nodeY(commit.row);
        return (
          <g
            key={commit.id}
            className={`thickness-node${fadedNode(commit.id)}`}
            data-testid={marked && "thickness-node"}
            data-commit={marked && commit.id}
            data-side={marked}
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
      </g>
    </>
  );
}

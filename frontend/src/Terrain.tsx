import { useMemo, useRef, useState } from "react";
import { type CommitView, type GraphEdge, UNCOMMITTED_ID } from "./api";
import { laneColor, NODE_RADIUS, shortId } from "./graph";
import { useT } from "./settings";
import {
  type Orientation,
  START,
  terrainKey,
  terrainLayout,
  turn,
  type TerrainCommit,
} from "./terrainModel";

/** Degrees the terrain turns per pixel dragged. */
const DRAG_DEGREES = 0.5;

/**
 * The history as terrain (ADR 0042): the graph on the ground, tilted back,
 * with each commit raising a pillar by the lines it added and sinking one by
 * the lines it deleted. Dragging or the arrow keys turn it; `0` resets it.
 */
export function Terrain({
  commits,
  edges,
}: {
  commits: CommitView[];
  edges: GraphEdge[];
}) {
  const t = useT();
  const [orientation, setOrientation] = useState<Orientation>(START);
  const [tip, setTip] = useState<{
    x: number;
    y: number;
    label: string;
  } | null>(null);
  const drag = useRef<{
    x: number;
    y: number;
    from: Orientation;
  } | null>(null);
  const layout = useMemo(
    () => terrainLayout(commits, edges, orientation),
    [commits, edges, orientation],
  );

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, from: orientation };
    setTip(null);
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const start = drag.current;
    if (start === null) return;
    setOrientation(
      turn(
        start.from,
        (e.clientX - start.x) * DRAG_DEGREES,
        -(e.clientY - start.y) * DRAG_DEGREES,
      ),
    );
  };
  const onPointerUp = () => {
    drag.current = null;
  };
  const onKeyDown = (e: React.KeyboardEvent<SVGSVGElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const next = terrainKey(e.key, orientation);
    if (next === null) return;
    e.preventDefault();
    setOrientation(next);
  };

  const hoverProps = (commit: CommitView) => ({
    onMouseEnter: (e: React.MouseEvent) => {
      if (drag.current !== null) return;
      setTip({ x: e.clientX, y: e.clientY, label: tipLabel(commit, t) });
    },
    onMouseLeave: () => setTip(null),
  });

  return (
    <>
      <svg
        className="terrain"
        data-testid="terrain"
        data-rotation={Math.round(orientation.rotation)}
        data-tilt={Math.round(orientation.tilt)}
        role="img"
        aria-label={t("terrainLabel")}
        tabIndex={0}
        width={layout.width}
        height={layout.height}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      >
        {layout.edges.map(({ edge, points }, i) => (
          <polyline
            key={i}
            points={points.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke={laneColor(edge.color)}
            strokeWidth={1.5}
            strokeDasharray={
              edge.dashed || edge.from === UNCOMMITTED_ID ? "4 3" : undefined
            }
            opacity={0.7}
          />
        ))}
        {layout.commits.map((placed) => (
          <g
            key={placed.commit.id}
            data-testid="terrain-node"
            data-summary={placed.commit.summary}
            {...hoverProps(placed.commit)}
          >
            <Pillar placed={placed} end={placed.down} kind="down" />
            <circle
              cx={placed.node.x}
              cy={placed.node.y}
              r={NODE_RADIUS - 1}
              fill={laneColor(placed.commit.color)}
            />
            <Pillar placed={placed} end={placed.up} kind="up" />
          </g>
        ))}
      </svg>
      {tip && (
        <span
          className="node-tip"
          data-testid="node-tip"
          style={{ left: tip.x + 12, top: tip.y + 12 }}
        >
          {tip.label}
        </span>
      )}
    </>
  );
}

function Pillar({
  placed,
  end,
  kind,
}: {
  placed: TerrainCommit;
  end: TerrainCommit["up"];
  kind: "up" | "down";
}) {
  if (end === undefined) return null;
  return (
    <line
      className={`terrain-pillar terrain-${kind}`}
      data-testid={`terrain-${kind}`}
      x1={placed.node.x}
      y1={placed.node.y}
      x2={end.x}
      y2={end.y}
    />
  );
}

function tipLabel(
  commit: CommitView,
  t: ReturnType<typeof useT>,
): string {
  const name =
    commit.uncommitted !== undefined
      ? t("uncommittedChanges")
      : `${shortId(commit.id)} ${commit.summary}`;
  return commit.stat
    ? `${name} +${commit.stat.added} −${commit.stat.deleted}`
    : name;
}

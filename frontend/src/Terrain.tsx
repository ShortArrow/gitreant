import { useEffect, useMemo, useRef, useState } from "react";
import { type CommitView, type GraphEdge, UNCOMMITTED_ID } from "./api";
import { laneColor, NODE_RADIUS, shortId } from "./graph";
import { useT } from "./settings";
import {
  type Camera,
  commitGround,
  grip,
  groundAt,
  pan,
  startCamera,
  terrainKey,
  terrainLayout,
  turn,
  type TerrainCommit,
  zoomAt,
} from "./terrainModel";

/** Degrees the terrain turns per pixel dragged. */
const DRAG_DEGREES = 0.5;
/** How fast the wheel zooms, per pixel of scroll. */
const WHEEL_ZOOM = 0.0015;
const PILLAR_WIDTH = 4;

type Drag =
  | { kind: "turn"; x: number; y: number; from: Camera }
  | { kind: "pan"; x: number; y: number };

/**
 * The history as terrain (ADR 0042): the graph on the ground, tilted back,
 * with each commit raising a pillar by the lines it added and sinking one by
 * the lines it deleted. It opens fitted to the pane. Dragging turns it,
 * a right or Shift drag moves it, the wheel zooms it, and the keys do all
 * three; `0` returns to the start.
 */
export function Terrain({
  commits,
  edges,
}: {
  commits: CommitView[];
  edges: GraphEdge[];
}) {
  const t = useT();
  const viewRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null,
  );
  const start = useRef<Camera | null>(null);
  const [camera, setCamera] = useState<Camera | null>(null);
  const [tip, setTip] = useState<{
    x: number;
    y: number;
    label: string;
  } | null>(null);
  const drag = useRef<Drag | null>(null);

  useEffect(() => {
    const view = viewRef.current;
    if (view === null) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    observer.observe(view);
    return () => observer.disconnect();
  }, []);

  // Fitted once, on the first size the pane has: later counts and loads
  // must not move a terrain the viewer has turned.
  useEffect(() => {
    if (size === null || start.current !== null) return;
    start.current = startCamera(commits, size);
    setCamera(start.current);
  }, [size, commits]);

  // A native listener: React's wheel listener is passive, and the page
  // must not scroll while the wheel zooms.
  useEffect(() => {
    const svg = svgRef.current;
    if (svg === null) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const box = svg.getBoundingClientRect();
      const at = {
        x: e.clientX - box.left - box.width / 2,
        y: e.clientY - box.top - box.height / 2,
      };
      setCamera((c) => c && zoomAt(c, Math.exp(-e.deltaY * WHEEL_ZOOM), at));
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [camera === null]);

  const layout = useMemo(
    () => camera && terrainLayout(commits, edges, camera),
    [commits, edges, camera],
  );

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (camera === null || (e.button !== 0 && e.button !== 2)) return;
    const svg = e.currentTarget;
    svg.setPointerCapture(e.pointerId);
    drag.current =
      e.button === 2 || e.shiftKey
        ? { kind: "pan", x: e.clientX, y: e.clientY }
        : {
            kind: "turn",
            x: e.clientX,
            y: e.clientY,
            from: grip(camera, groundUnder(e, svg, camera)),
          };
    setTip(null);
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const current = drag.current;
    if (current === null) return;
    if (current.kind === "turn") {
      setCamera(
        turn(
          current.from,
          (e.clientX - current.x) * DRAG_DEGREES,
          -(e.clientY - current.y) * DRAG_DEGREES,
        ),
      );
      return;
    }
    const dx = e.clientX - current.x;
    const dy = e.clientY - current.y;
    drag.current = { kind: "pan", x: e.clientX, y: e.clientY };
    setCamera((c) => c && pan(c, dx, dy));
  };
  const onPointerUp = () => {
    drag.current = null;
  };
  // A turn goes about what the drag began on: a commit's node or pillar,
  // or else the ground under the pointer.
  const groundUnder = (
    e: React.PointerEvent,
    svg: SVGSVGElement,
    from: Camera,
  ) => {
    const id = (e.target as Element)
      .closest("[data-commit]")
      ?.getAttribute("data-commit");
    const commit = commits.find((c) => c.id === id);
    if (commit) return commitGround(commit);
    const box = svg.getBoundingClientRect();
    return groundAt(from, {
      x: e.clientX - box.left - box.width / 2,
      y: e.clientY - box.top - box.height / 2,
    });
  };
  const onKeyDown = (e: React.KeyboardEvent<SVGSVGElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (camera === null || start.current === null) return;
    const next = terrainKey(e.key, camera, start.current);
    if (next === null) return;
    e.preventDefault();
    setCamera(next);
  };

  const hoverProps = (commit: CommitView) => ({
    onMouseEnter: (e: React.MouseEvent) => {
      if (drag.current !== null) return;
      setTip({ x: e.clientX, y: e.clientY, label: tipLabel(commit, t) });
    },
    onMouseLeave: () => setTip(null),
  });

  // Marks shrink with a terrain zoomed far out, but stay visible.
  const zoom = camera?.zoom ?? 1;
  const nodeRadius = Math.max(1.5, Math.min(NODE_RADIUS - 1, 4 * zoom));
  const pillarWidth = Math.max(1.5, Math.min(PILLAR_WIDTH, 4 * zoom));

  return (
    <div className="terrain-view" ref={viewRef}>
      {size && camera && layout && (
        <svg
          ref={svgRef}
          className="terrain"
          data-testid="terrain"
          data-rotation={Math.round(camera.rotation)}
          data-tilt={Math.round(camera.tilt)}
          data-zoom={camera.zoom.toFixed(3)}
          role="img"
          aria-label={t("terrainLabel")}
          tabIndex={0}
          width={size.width}
          height={size.height}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onContextMenu={(e) => e.preventDefault()}
          onKeyDown={onKeyDown}
        >
          <g transform={`translate(${size.width / 2},${size.height / 2})`}>
            {layout.edges.map(({ edge, points }, i) => (
              <polyline
                key={i}
                points={points.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke={laneColor(edge.color)}
                strokeWidth={1.5}
                strokeDasharray={
                  edge.dashed || edge.from === UNCOMMITTED_ID
                    ? "4 3"
                    : undefined
                }
                opacity={0.7}
              />
            ))}
            {layout.commits.map((placed) => (
              <g
                key={placed.commit.id}
                data-testid="terrain-node"
                data-commit={placed.commit.id}
                data-summary={placed.commit.summary}
                {...hoverProps(placed.commit)}
              >
                <Pillar
                  placed={placed}
                  end={placed.down}
                  kind="down"
                  width={pillarWidth}
                />
                <circle
                  cx={placed.node.x}
                  cy={placed.node.y}
                  r={nodeRadius}
                  fill={laneColor(placed.commit.color)}
                />
                <Pillar
                  placed={placed}
                  end={placed.up}
                  kind="up"
                  width={pillarWidth}
                />
              </g>
            ))}
          </g>
        </svg>
      )}
      {tip && (
        <span
          className="node-tip"
          data-testid="node-tip"
          style={{ left: tip.x + 12, top: tip.y + 12 }}
        >
          {tip.label}
        </span>
      )}
    </div>
  );
}

function Pillar({
  placed,
  end,
  kind,
  width,
}: {
  placed: TerrainCommit;
  end: TerrainCommit["up"];
  kind: "up" | "down";
  width: number;
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
      strokeWidth={width}
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

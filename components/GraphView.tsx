"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GraphEdge, GraphResponse } from "@/lib/graph-types";

/*
 * The page graph — the app's signature surface. A one-hop neighborhood map of a
 * page: its nesting (parent/children, solid edges) and its link references
 * (page_link blocks, dashed edges), with the subject glowing at the center like
 * a focal star and its neighbors orbiting it.
 *
 * Layout is a small hand-rolled force simulation run to convergence inside a
 * memo (no dependency, no animation loop, no refs-in-render — clean under the
 * project's React Compiler lint rules). Pairwise repulsion spreads neighbors, a
 * spring on every edge pulls them to a comfortable radius, and the center is
 * pinned at (0, 0) so navigation always re-centers on the subject.
 */

interface LaidOutNode {
  id: string;
  title: string;
  isDatabase: boolean;
  isCenter: boolean;
  x: number;
  y: number;
}

// Beyond this many neighbors the outer ring shrinks and dims so a busy page
// doesn't collapse into a hairball.
const CROWD_THRESHOLD = 15;

const VIEW = 320; // SVG viewBox spans [-VIEW/2 .. VIEW/2] on both axes.
const LINK_DISTANCE = 84;
const REPULSION = 3200;
const SPRING = 0.08;
const ITERATIONS = 320;

export function GraphView({
  graph,
  loading,
}: {
  graph: GraphResponse | null;
  loading: boolean;
}) {
  const router = useRouter();
  const [hoverId, setHoverId] = useState<string | null>(null);

  const layout = useMemo(() => computeLayout(graph), [graph]);
  // A stable key for the dataset so the entrance animation replays per page.
  const enterKey = graph
    ? [graph.center.id, ...graph.nodes.map((n) => n.id)].join("|")
    : "";

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground/60">
        Mapping connections…
      </div>
    );
  }
  // A lone center with no neighbors isn't a graph worth drawing — show a nudge
  // instead of a single floating dot.
  if (!graph || graph.nodes.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 px-8 text-center">
        <div className="flex size-11 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground/50">
          <FileText className="size-5" />
        </div>
        <p className="text-sm text-muted-foreground/70 leading-relaxed">
          No connections yet. Nest a sub-page or drop in a page-link block, and
          this page&apos;s map appears here.
        </p>
      </div>
    );
  }

  const { nodes, edges } = layout;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const crowded = nodes.length > CROWD_THRESHOLD;
  const centerId = graph.center.id;

  // 1-hop graph: every neighbor connects only to the center, so hovering a
  // neighbor spotlights it + the center + their shared edge; hovering the
  // center spotlights everything.
  const isLit = (id: string) =>
    hoverId == null ||
    hoverId === id ||
    (hoverId !== centerId && id === centerId) ||
    hoverId === centerId;

  return (
    <div className="flex-1 min-h-0 p-2 flex items-center justify-center">
      <svg
        viewBox={`${-VIEW / 2} ${-VIEW / 2} ${VIEW} ${VIEW}`}
        className="w-full aspect-square"
        aria-label="Page connections graph"
      >
        <defs>
          {/* Soft focal glow behind the whole map — gives the panel depth. */}
          <radialGradient id="graph-vignette" cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.10" />
            <stop offset="55%" stopColor="var(--primary)" stopOpacity="0.03" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </radialGradient>
          {/* Center node glow. */}
          <radialGradient id="graph-center-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </radialGradient>
        </defs>

        <rect
          x={-VIEW / 2}
          y={-VIEW / 2}
          width={VIEW}
          height={VIEW}
          fill="url(#graph-vignette)"
        />

        <g key={enterKey} className="graph-enter">
          {/* Edges */}
          <g strokeLinecap="round">
            {edges.map((edge, i) => {
              const src = byId.get(edge.source);
              const dst = byId.get(edge.target);
              if (!src || !dst) return null;
              const lit = isLit(src.id) && isLit(dst.id);
              const hierarchy = edge.kind === "hierarchy";
              return (
                <line
                  key={i}
                  x1={src.x}
                  y1={src.y}
                  x2={dst.x}
                  y2={dst.y}
                  stroke={hierarchy ? "var(--primary)" : "var(--muted-foreground)"}
                  strokeWidth={hierarchy ? 1.5 : 1}
                  strokeDasharray={hierarchy ? undefined : "2 4"}
                  opacity={lit ? (hierarchy ? 0.55 : 0.4) : 0.08}
                  style={{ transition: "opacity 160ms" }}
                />
              );
            })}
          </g>
          {/* Nodes */}
          <g>
            {nodes.map((n) => (
              <GraphNodeEl
                key={n.id}
                node={n}
                crowded={crowded}
                lit={isLit(n.id)}
                hovered={hoverId === n.id}
                onHover={setHoverId}
                onClick={() => {
                  if (!n.isCenter) router.push(`/pages/${n.id}`);
                }}
              />
            ))}
          </g>
        </g>
      </svg>
    </div>
  );
}

interface SimNode extends LaidOutNode {
  vx: number;
  vy: number;
  pinned: boolean;
}

function computeLayout(graph: GraphResponse | null): {
  nodes: LaidOutNode[];
  edges: GraphEdge[];
} {
  if (!graph) return { nodes: [], edges: [] };
  const ring = graph.nodes;
  const center: SimNode = {
    id: graph.center.id,
    title: graph.center.title,
    isDatabase: graph.center.isDatabase,
    isCenter: true,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    pinned: true,
  };
  // Neighbors start on a ring so the simulation converges instead of exploding
  // out of a single coincident point.
  const nodes: SimNode[] = [
    center,
    ...ring.map((n, i) => {
      const angle = (Math.PI * 2 * i) / Math.max(ring.length, 1) - Math.PI / 2;
      return {
        id: n.id,
        title: n.title,
        isDatabase: n.isDatabase,
        isCenter: false,
        x: Math.cos(angle) * LINK_DISTANCE,
        y: Math.sin(angle) * LINK_DISTANCE,
        vx: 0,
        vy: 0,
        pinned: false,
      } satisfies SimNode;
    }),
  ];

  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (let iter = 0; iter < ITERATIONS; iter++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 0.01) {
          dx = i - j || 1;
          dy = 1;
          d2 = dx * dx + dy * dy;
        }
        const d = Math.sqrt(d2);
        const f = REPULSION / d2;
        a.vx += (dx / d) * f;
        a.vy += (dy / d) * f;
        b.vx -= (dx / d) * f;
        b.vy -= (dy / d) * f;
      }
    }
    for (const edge of graph.edges) {
      const a = byId.get(edge.source);
      const b = byId.get(edge.target);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const f = (d - LINK_DISTANCE) * SPRING;
      a.vx += (dx / d) * f;
      a.vy += (dy / d) * f;
      b.vx -= (dx / d) * f;
      b.vy -= (dy / d) * f;
    }
    const damping = 0.82;
    for (const n of nodes) {
      if (n.pinned) {
        n.vx = 0;
        n.vy = 0;
        continue;
      }
      n.vx = (n.vx - n.x * 0.015) * damping;
      n.vy = (n.vy - n.y * 0.015) * damping;
      n.x += n.vx;
      n.y += n.vy;
    }
  }

  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      title: n.title,
      isDatabase: n.isDatabase,
      isCenter: n.isCenter,
      x: n.x,
      y: n.y,
    })),
    edges: graph.edges,
  };
}

function GraphNodeEl({
  node,
  crowded,
  lit,
  hovered,
  onHover,
  onClick,
}: {
  node: LaidOutNode;
  crowded: boolean;
  lit: boolean;
  hovered: boolean;
  onHover: (id: string | null) => void;
  onClick: () => void;
}) {
  const isCenter = node.isCenter;
  const shrink = crowded && !isCenter;
  const r = isCenter ? 9 : shrink ? 4 : 6;
  const Icon = node.isDatabase ? Table2 : FileText;

  return (
    <g
      transform={`translate(${node.x}, ${node.y})`}
      opacity={lit ? 1 : 0.3}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
      onClick={onClick}
      className={cn(!isCenter && "cursor-pointer")}
      style={{ transition: "opacity 160ms" }}
    >
      {isCenter && <circle r={26} fill="url(#graph-center-glow)" />}
      {/* Hover ring for neighbors. */}
      {!isCenter && (
        <circle
          r={r + 4}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={1.5}
          opacity={hovered ? 0.7 : 0}
          style={{ transition: "opacity 160ms" }}
        />
      )}
      <circle
        r={r}
        fill={isCenter ? "var(--primary)" : "var(--card)"}
        stroke={isCenter ? "var(--primary)" : hovered ? "var(--primary)" : "var(--border)"}
        strokeWidth={1.5}
        style={{ transition: "stroke 160ms" }}
      />
      {!shrink && (
        <foreignObject x={-8} y={-8} width={16} height={16} style={{ pointerEvents: "none" }}>
          <div className="flex h-full w-full items-center justify-center">
            <Icon
              className="size-3"
              style={{
                color: isCenter ? "var(--primary-foreground)" : "var(--muted-foreground)",
              }}
            />
          </div>
        </foreignObject>
      )}
      <text
        y={r + 13}
        textAnchor="middle"
        // paint-order:stroke draws a panel-colored halo behind the glyphs so
        // labels stay legible where they cross edges.
        style={{
          fontSize: isCenter ? 11.5 : shrink ? 9 : 10,
          paintOrder: "stroke",
          stroke: "var(--sidebar)",
          strokeWidth: 3,
          strokeLinejoin: "round",
        }}
        className={cn(
          "pointer-events-none select-none",
          isCenter
            ? "fill-foreground font-semibold"
            : lit
            ? "fill-foreground/90"
            : "fill-muted-foreground"
        )}
      >
        {truncate(node.title || "Untitled", 22)}
      </text>
    </g>
  );
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

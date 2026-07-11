"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  forceCenter,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";
import { FileText, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GraphNode, GraphResponse } from "@/lib/graph-types";

/*
 * SVG-based force-directed graph view for a page's one-hop neighborhood.
 * Center node is pinned at (0, 0) so navigation always lands with the
 * subject page in the middle. Simulation runs for a bounded number of ticks
 * on each data change and then stops — no perpetual jitter.
 *
 * `d3-force` is used as a headless physics engine only. React owns the DOM
 * (SVG), so click / hover / navigation stay in the React idiom.
 */

interface SimNode extends SimulationNodeDatum {
  id: string;
  title: string;
  isDatabase: boolean;
  /** "center" | "outbound" | "inbound" — drives styling and edge direction. */
  role: "center" | "outbound" | "inbound";
}

type SimLink = SimulationLinkDatum<SimNode>;

// Crowded-graph threshold from the spec: once we hit this many nodes the
// outer ring shrinks and dims so the layout doesn't turn into a hairball.
const CROWD_THRESHOLD = 15;

// SVG viewBox size — the simulation runs in this coordinate space with (0, 0)
// at the visual center via forceCenter.
const VIEW_W = 320;
const VIEW_H = 320;

export function GraphView({
  graph,
  loading,
}: {
  graph: GraphResponse | null;
  loading: boolean;
}) {
  const router = useRouter();
  const [tick, setTick] = useState(0); // bump to re-render on simulation tick
  const [hoverId, setHoverId] = useState<string | null>(null);
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);

  // Build the sim inputs whenever the payload changes. Center pinned at (0, 0);
  // peripheral nodes get an initial radial spread so the first ticks converge
  // faster and the layout doesn't ping-pong.
  const { nodes, links } = useMemo(() => {
    if (!graph) return { nodes: [] as SimNode[], links: [] as SimLink[] };
    const center: SimNode = {
      id: graph.center.id,
      title: graph.center.title,
      isDatabase: graph.center.isDatabase,
      role: "center",
      fx: 0,
      fy: 0,
    };
    const ring: SimNode[] = [];
    // De-dupe: if a page is both linked to AND links back, prefer "outbound"
    // slot (they're logically distinct edges but we render one node).
    const seen = new Set<string>([graph.center.id]);
    const push = (p: GraphNode, role: "outbound" | "inbound") => {
      if (seen.has(p.id)) return;
      seen.add(p.id);
      const angle = (Math.PI * 2 * ring.length) / 8;
      ring.push({
        id: p.id,
        title: p.title,
        isDatabase: p.isDatabase,
        role,
        x: Math.cos(angle) * 90,
        y: Math.sin(angle) * 90,
      });
    };
    graph.outbound.forEach((p) => push(p, "outbound"));
    graph.inbound.forEach((p) => push(p, "inbound"));

    const allNodes = [center, ...ring];
    const linkList: SimLink[] = ring.map((n) => ({ source: center, target: n }));
    return { nodes: allNodes, links: linkList };
  }, [graph]);

  // (Re)start the simulation whenever the input changes.
  useEffect(() => {
    // Stop any previous simulation.
    simRef.current?.stop();
    if (nodes.length === 0) {
      simRef.current = null;
      return;
    }
    const sim = forceSimulation<SimNode>(nodes)
      .force(
        "link",
        forceLink<SimNode, SimLink>(links).distance(70).strength(0.9)
      )
      .force("charge", forceManyBody<SimNode>().strength(-260))
      .force("center", forceCenter(0, 0))
      .alpha(1)
      .alphaDecay(0.05);
    simRef.current = sim;

    // React-driven rendering: bump a tick counter so components re-render.
    // Bounded — d3-force stops itself once alpha decays below alphaMin.
    sim.on("tick", () => setTick((t) => t + 1));
    return () => {
      sim.stop();
    };
  }, [nodes, links]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground/60">
        Loading graph…
      </div>
    );
  }
  if (!graph || nodes.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center px-4 text-sm text-center text-muted-foreground/60">
        Nothing to graph yet — link this page to another with a page-link
        block and connections will appear here.
      </div>
    );
  }

  const crowded = nodes.length > CROWD_THRESHOLD;

  return (
    <div className="flex-1 min-h-0 p-3 flex items-start justify-center">
      <svg
        viewBox={`${-VIEW_W / 2} ${-VIEW_H / 2} ${VIEW_W} ${VIEW_H}`}
        className="w-full aspect-square"
        aria-label="Page connections graph"
      >
        {/* Edges */}
        <g stroke="var(--border)" strokeWidth={1} strokeLinecap="round">
          {links.map((l, i) => {
            const src = l.source as SimNode;
            const dst = l.target as SimNode;
            return (
              <line
                key={i}
                x1={src.x ?? 0}
                y1={src.y ?? 0}
                x2={dst.x ?? 0}
                y2={dst.y ?? 0}
                opacity={hoverId && hoverId !== src.id && hoverId !== dst.id ? 0.25 : 0.6}
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
              hoverId={hoverId}
              onHover={setHoverId}
              onClick={() => {
                if (n.role !== "center") router.push(`/pages/${n.id}`);
              }}
            />
          ))}
        </g>
      </svg>
      {/*
       * `tick` participates in render so the SVG updates as the simulation
       * moves nodes. Referencing it here keeps eslint happy while making the
       * intent obvious.
       */}
      <span className="hidden">{tick}</span>
    </div>
  );
}

function GraphNodeEl({
  node,
  crowded,
  hoverId,
  onHover,
  onClick,
}: {
  node: SimNode;
  crowded: boolean;
  hoverId: string | null;
  onHover: (id: string | null) => void;
  onClick: () => void;
}) {
  const isCenter = node.role === "center";
  const dim = hoverId && hoverId !== node.id && !isCenter;
  const shrink = crowded && !isCenter;
  const r = isCenter ? 8 : shrink ? 4 : 6;
  const opacity = dim ? 0.4 : shrink && !isCenter ? 0.6 : 1;
  const labelDy = r + 12;
  const Icon = node.isDatabase ? Table2 : FileText;

  return (
    <g
      transform={`translate(${node.x ?? 0}, ${node.y ?? 0})`}
      opacity={opacity}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
      onClick={onClick}
      className={cn(!isCenter && "cursor-pointer")}
      style={{ transition: "opacity 120ms" }}
    >
      <circle
        r={r}
        fill={isCenter ? "var(--primary)" : "var(--secondary)"}
        stroke={isCenter ? "var(--primary)" : "var(--border)"}
        strokeWidth={1.5}
      />
      <foreignObject
        x={-8}
        y={-8}
        width={16}
        height={16}
        style={{ pointerEvents: "none" }}
      >
        <div className="flex items-center justify-center w-full h-full">
          <Icon
            className="size-3"
            style={{ color: isCenter ? "var(--primary-foreground)" : "var(--muted-foreground)" }}
          />
        </div>
      </foreignObject>
      <text
        y={labelDy}
        textAnchor="middle"
        className={cn(
          "select-none pointer-events-none",
          isCenter ? "fill-foreground font-semibold" : "fill-muted-foreground"
        )}
        style={{ fontSize: isCenter ? 11 : shrink ? 9 : 10 }}
      >
        {truncate(node.title || "Untitled", 22)}
      </text>
    </g>
  );
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

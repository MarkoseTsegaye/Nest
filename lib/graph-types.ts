/*
 * Shape of the graph payload — a page's one-hop neighborhood.
 *
 * Two kinds of relationship are surfaced so the graph is genuinely useful, not
 * just a link dump:
 *   - "hierarchy": page nesting (parent ⟶ child). This mirrors the sidebar tree.
 *   - "link": a page_link block reference (linker ⟶ linkee), i.e. backlinks.
 *
 * The payload is a flat node list plus a flat edge list. Every edge touches the
 * center (the graph is one hop), and `kind` drives the edge's styling so the two
 * relationship types read differently.
 */
export type GraphEdgeKind = "hierarchy" | "link";

export interface GraphNode {
  id: string;
  title: string;
  isDatabase: boolean;
}

export interface GraphEdge {
  source: string;
  target: string;
  kind: GraphEdgeKind;
}

export interface GraphResponse {
  /** The page the graph is currently focused on. */
  center: GraphNode;
  /** Every neighbor node (parent, children, outbound + inbound links), de-duped. */
  nodes: GraphNode[];
  /** Edges from/to the center, directed. */
  edges: GraphEdge[];
}

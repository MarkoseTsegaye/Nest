/*
 * Shape of the graph payload — a page's one-hop neighborhood via page_link
 * blocks. Used by GET /api/pages/[id]/graph and the client-side renderer.
 * Deliberately flat — no nested edges — because the neighborhood is at most
 * one hop in each direction and edges are always to/from the center.
 */
export interface GraphNode {
  id: string;
  title: string;
  isDatabase: boolean;
}

export interface GraphResponse {
  /** The page the graph is currently focused on. */
  center: GraphNode;
  /** Pages this page links to (via page_link blocks contained here). */
  outbound: GraphNode[];
  /** Pages that link to this page (backlinks). */
  inbound: GraphNode[];
}

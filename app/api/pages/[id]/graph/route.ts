import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/api-error";
import type { GraphEdge, GraphNode, GraphResponse } from "@/lib/graph-types";

type Params = { params: Promise<{ id: string }> };

const nodeSelect = { id: true, title: true, isDatabase: true } as const;

/*
 * One-hop graph neighborhood of a page.
 *
 * Surfaces both relationship types the app has:
 *   - hierarchy: the page's parent and its direct children (nesting).
 *   - link: pages this page's page_link blocks reference (outbound) and pages
 *     whose blocks reference this page (inbound / backlinks).
 *
 * All the reads run in a single Prisma transaction. Nodes are de-duped by id
 * (a page can be both a child AND a backlink, say) while edges stay distinct so
 * both relationships are drawn. Self-references are dropped so the center never
 * links to itself.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const [center, children, outbound, inbound] = await prisma.$transaction([
      prisma.page.findUniqueOrThrow({
        where: { id },
        select: { ...nodeSelect, parentId: true, parent: { select: nodeSelect } },
      }),
      prisma.page.findMany({
        where: { parentId: id },
        select: nodeSelect,
        orderBy: { createdAt: "asc" },
      }),
      prisma.page.findMany({
        where: { id: { not: id }, linkedByBlocks: { some: { pageId: id } } },
        select: nodeSelect,
        orderBy: { title: "asc" },
      }),
      prisma.page.findMany({
        where: { id: { not: id }, blocks: { some: { linkedPageId: id } } },
        select: nodeSelect,
        orderBy: { title: "asc" },
      }),
    ]);

    const nodes = new Map<string, GraphNode>();
    const edges: GraphEdge[] = [];
    const addNode = (n: GraphNode) => {
      if (n.id !== id && !nodes.has(n.id)) nodes.set(n.id, n);
    };

    if (center.parent) {
      addNode(center.parent);
      edges.push({ source: center.parent.id, target: id, kind: "hierarchy" });
    }
    for (const child of children) {
      addNode(child);
      edges.push({ source: id, target: child.id, kind: "hierarchy" });
    }
    for (const p of outbound) {
      addNode(p);
      edges.push({ source: id, target: p.id, kind: "link" });
    }
    for (const p of inbound) {
      addNode(p);
      edges.push({ source: p.id, target: id, kind: "link" });
    }

    const payload: GraphResponse = {
      center: { id: center.id, title: center.title, isDatabase: center.isDatabase },
      nodes: [...nodes.values()],
      edges,
    };
    return NextResponse.json(payload);
  } catch (error) {
    return errorResponse(error);
  }
}

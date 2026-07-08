import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/api-error";
import type { GraphResponse } from "@/lib/graph-types";

type Params = { params: Promise<{ id: string }> };

/*
 * One-hop graph neighborhood of a page via page_link blocks.
 *
 * Three queries run in a single Prisma transaction:
 *   1. The center page itself.
 *   2. Outbound: pages this page links to — pulled through Block on pageId.
 *   3. Inbound (backlinks): pages that link to this page — pulled through
 *      Block on linkedPageId. Uses the Block_linkedPageId_idx added in the
 *      companion migration, so this stays O(log n) instead of a table scan.
 *
 * We de-dupe within each side (multiple page_link blocks pointing at the same
 * target still yield one node) and self-links are dropped so the center never
 * appears as its own neighbor.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const [center, outbound, inbound] = await prisma.$transaction([
      prisma.page.findUniqueOrThrow({
        where: { id },
        select: { id: true, title: true, isDatabase: true },
      }),
      prisma.page.findMany({
        where: {
          id: { not: id },
          linkedByBlocks: { some: { pageId: id } },
        },
        select: { id: true, title: true, isDatabase: true },
        orderBy: { title: "asc" },
      }),
      prisma.page.findMany({
        where: {
          id: { not: id },
          blocks: { some: { linkedPageId: id } },
        },
        select: { id: true, title: true, isDatabase: true },
        orderBy: { title: "asc" },
      }),
    ]);

    const payload: GraphResponse = { center, outbound, inbound };
    return NextResponse.json(payload);
  } catch (error) {
    return errorResponse(error);
  }
}

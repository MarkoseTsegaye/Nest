import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/api-error";

// Flat list of every page, used to build the sidebar tree on the client.
export async function GET() {
  const pages = await prisma.page.findMany({
    select: {
      id: true,
      title: true,
      parentId: true,
      isDatabase: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(pages);
}

const createPageSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(1).optional(),
  parentId: z.string().optional(),
  /** Client-minted id for the default text block created alongside the page.
   *  If omitted, the server generates one. */
  defaultBlockId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = createPageSchema.parse(await request.json().catch(() => ({})));
    // Create the page and its default empty text block atomically. Every page
    // ships with one empty text block ready to type in — the same behaviour
    // seed data has — so opening a fresh page doesn't dump you into a bare
    // "Add block" prompt.
    const page = await prisma.$transaction(async (tx) => {
      const created = await tx.page.create({
        data: {
          id: body.id,
          title: body.title ?? "Untitled",
          parentId: body.parentId,
        },
      });
      await tx.block.create({
        data: {
          id: body.defaultBlockId,
          pageId: created.id,
          type: "text",
          order: 0,
          content: "[]",
        },
      });
      return created;
    });
    return NextResponse.json(page, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

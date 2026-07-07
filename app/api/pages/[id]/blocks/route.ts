import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/api-error";

type Params = { params: Promise<{ id: string }> };

const createBlockSchema = z.object({
  id: z.string().optional(),
  type: z.enum(["text", "heading", "page_link"]),
  content: z.string().optional(),
  headingLevel: z.number().int().min(1).max(3).optional(),
  linkedPageId: z.string().optional(),
});

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = createBlockSchema.parse(await request.json());

    const last = await prisma.block.findFirst({
      where: { pageId: id },
      orderBy: { order: "desc" },
      select: { order: true },
    });

    let linkedPageId = body.linkedPageId;
    if (body.type === "page_link") {
      if (linkedPageId) {
        // The client mints the linked page's id so it can render the block and
        // the sidebar entry immediately; create that page here if it's new.
        const existing = await prisma.page.findUnique({
          where: { id: linkedPageId },
          select: { id: true },
        });
        if (!existing) {
          await prisma.page.create({
            data: { id: linkedPageId, title: "Untitled", parentId: id },
          });
        }
      } else {
        const child = await prisma.page.create({
          data: { title: "Untitled", parentId: id },
        });
        linkedPageId = child.id;
      }
    }

    const block = await prisma.block.create({
      data: {
        id: body.id,
        pageId: id,
        type: body.type,
        content: body.content,
        headingLevel: body.headingLevel,
        linkedPageId,
        order: (last?.order ?? -1) + 1,
      },
      include: { linkedPage: { select: { id: true, title: true } } },
    });
    return NextResponse.json(block, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

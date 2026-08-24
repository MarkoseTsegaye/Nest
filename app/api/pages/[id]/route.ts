import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/api-error";
import { parseContent } from "@/lib/block-content";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const page = await prisma.page.findUniqueOrThrow({
      where: { id },
      include: {
        parent: { select: { id: true, title: true } },
        blocks: {
          orderBy: { order: "asc" },
          include: { linkedPage: { select: { id: true, title: true } } },
        },
        properties: { orderBy: { order: "asc" } },
        propertyValues: { include: { property: true } },
        children: {
          orderBy: { createdAt: "asc" },
          include: { propertyValues: { include: { property: true } } },
        },
      },
    });
    // Blocks store `content` as a JSON string on disk; parse to Span[] before
    // sending so the client works with the typed shape everywhere.
    const shaped = {
      ...page,
      blocks: page.blocks.map((b) => ({
        ...b,
        content: b.type === "page_link" ? null : parseContent(b.content),
      })),
    };
    return NextResponse.json(shaped);
  } catch (error) {
    return errorResponse(error);
  }
}

const updatePageSchema = z.object({
  title: z.string().trim().min(1).optional(),
  isDatabase: z.boolean().optional(),
});

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = updatePageSchema.parse(await request.json());
    const page = await prisma.page.update({
      where: { id },
      data: body,
    });
    return NextResponse.json(page);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    await prisma.page.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}

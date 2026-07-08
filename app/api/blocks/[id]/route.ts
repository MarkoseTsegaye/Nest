import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/api-error";
import { parseContent, serializeContent } from "@/lib/block-content";
import { blockContentSchema } from "@/lib/api-content-schema";

type Params = { params: Promise<{ id: string }> };

// `type` is patchable so slash commands can convert a text block into a
// heading/list item without recreating it. `content` (when present) is a
// Span[] — stored as JSON on disk, exposed as Span[] on the wire.
const updateBlockSchema = z.object({
  type: z
    .enum(["text", "heading", "bulleted_list_item", "numbered_list_item"])
    .optional(),
  content: blockContentSchema.optional(),
  headingLevel: z.number().int().min(1).max(3).nullable().optional(),
  order: z.number().int().optional(),
});

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = updateBlockSchema.parse(await request.json());
    const block = await prisma.block.update({
      where: { id },
      data: {
        ...body,
        content: body.content !== undefined ? serializeContent(body.content) : undefined,
      },
      include: { linkedPage: { select: { id: true, title: true } } },
    });
    return NextResponse.json({
      ...block,
      content: block.type === "page_link" ? null : parseContent(block.content),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    await prisma.block.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}

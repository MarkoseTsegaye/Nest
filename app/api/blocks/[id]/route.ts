import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/api-error";

type Params = { params: Promise<{ id: string }> };

const updateBlockSchema = z.object({
  content: z.string().optional(),
  headingLevel: z.number().int().min(1).max(3).nullable().optional(),
  order: z.number().int().optional(),
});

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = updateBlockSchema.parse(await request.json());
    const block = await prisma.block.update({
      where: { id },
      data: body,
      include: { linkedPage: { select: { id: true, title: true } } },
    });
    return NextResponse.json(block);
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

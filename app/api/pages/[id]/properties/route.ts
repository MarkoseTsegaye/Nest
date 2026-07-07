import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/api-error";

type Params = { params: Promise<{ id: string }> };

const createPropertySchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1),
  type: z.enum(["text", "select", "date"]),
  selectOptions: z.array(z.string()).optional(),
});

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = createPropertySchema.parse(await request.json());

    const last = await prisma.databaseProperty.findFirst({
      where: { pageId: id },
      orderBy: { order: "desc" },
      select: { order: true },
    });

    const property = await prisma.databaseProperty.create({
      data: {
        id: body.id,
        pageId: id,
        name: body.name,
        type: body.type,
        selectOptions: JSON.stringify(body.selectOptions ?? []),
        order: (last?.order ?? -1) + 1,
      },
    });
    return NextResponse.json(property, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

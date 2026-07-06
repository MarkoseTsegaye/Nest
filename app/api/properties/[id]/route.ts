import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/api-error";

type Params = { params: Promise<{ id: string }> };

const updatePropertySchema = z.object({
  name: z.string().trim().min(1).optional(),
  selectOptions: z.array(z.string()).optional(),
});

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = updatePropertySchema.parse(await request.json());
    const property = await prisma.databaseProperty.update({
      where: { id },
      data: {
        name: body.name,
        selectOptions:
          body.selectOptions !== undefined
            ? JSON.stringify(body.selectOptions)
            : undefined,
      },
    });
    return NextResponse.json(property);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    await prisma.databaseProperty.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/api-error";

type Params = { params: Promise<{ id: string }> };

const setValueSchema = z.object({
  propertyId: z.string(),
  value: z.string().nullable(),
});

// Upserts a single cell value for a row (a row is just a Page).
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = setValueSchema.parse(await request.json());
    const propertyValue = await prisma.propertyValue.upsert({
      where: { pageId_propertyId: { pageId: id, propertyId: body.propertyId } },
      create: { pageId: id, propertyId: body.propertyId, value: body.value },
      update: { value: body.value },
      include: { property: true },
    });
    return NextResponse.json(propertyValue);
  } catch (error) {
    return errorResponse(error);
  }
}

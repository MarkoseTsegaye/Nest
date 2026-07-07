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
});

export async function POST(request: NextRequest) {
  try {
    const body = createPageSchema.parse(await request.json().catch(() => ({})));
    const page = await prisma.page.create({
      data: {
        id: body.id,
        title: body.title ?? "Untitled",
        parentId: body.parentId,
      },
    });
    return NextResponse.json(page, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

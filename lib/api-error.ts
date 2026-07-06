import { NextResponse } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import { ZodError } from "zod";

export function errorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: error.issues }, { status: 400 });
  }
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2025"
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  console.error(error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildFtsQuery, type SearchHit } from "@/lib/search";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/*
 * Full-text search over the SearchIndex FTS5 virtual table (see the
 * add_search_index migration). Returns ranked hits with snippet HTML.
 * The FTS table isn't in Prisma's model layer, so we go through $queryRawUnsafe
 * — no user input is interpolated: q is parameterized, limit is coerced.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const limitParam = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0
    ? Math.min(Math.floor(limitParam), MAX_LIMIT)
    : DEFAULT_LIMIT;

  const ftsQuery = buildFtsQuery(q);
  if (!ftsQuery) return NextResponse.json([]);

  const rows = await prisma.$queryRawUnsafe<
    Array<{ kind: string; pageId: string; blockId: string; title: string; snippet: string }>
  >(
    `SELECT kind, pageId, blockId, title,
            snippet("SearchIndex", 4, '<mark>', '</mark>', '…', 10) AS snippet
     FROM "SearchIndex"
     WHERE "text" MATCH ?
     ORDER BY bm25("SearchIndex")
     LIMIT ?`,
    ftsQuery,
    limit
  );

  const hits: SearchHit[] = rows.map((r) => ({
    kind: r.kind === "page" ? "page" : "block",
    pageId: r.pageId,
    blockId: r.blockId || null,
    title: r.title,
    snippet: r.snippet,
  }));

  return NextResponse.json(hits);
}

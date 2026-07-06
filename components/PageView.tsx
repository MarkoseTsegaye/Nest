"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ChevronLeft, Table2 } from "lucide-react";
import { api } from "@/lib/api-client";
import { usePages } from "@/lib/pages-context";
import type { PageDetail } from "@/lib/types";
import { BlockEditor } from "./BlockEditor";
import { DatabaseView } from "./DatabaseView";
import { useDebouncedCallback } from "@/lib/use-debounced-callback";

export function PageView({ pageId }: { pageId: string }) {
  const [page, setPage] = useState<PageDetail | null>(null);
  const [title, setTitle] = useState("");
  const [notFound, setNotFound] = useState(false);
  const { refresh: refreshSidebar } = usePages();

  const load = useCallback(async () => {
    try {
      const data = await api.getPage(pageId);
      setPage(data);
      setTitle(data.title);
      setNotFound(false);
    } catch {
      setNotFound(true);
    }
  }, [pageId]);

  useEffect(() => {
    api.getPage(pageId).then(
      (data) => {
        setPage(data);
        setTitle(data.title);
        setNotFound(false);
      },
      () => setNotFound(true)
    );
  }, [pageId]);

  const saveTitle = useDebouncedCallback(async (value: string) => {
    await api.updatePage(pageId, { title: value || "Untitled" });
    await refreshSidebar();
  }, 500);

  async function makeDatabase() {
    const updated = await api.updatePage(pageId, { isDatabase: true });
    setPage((p) => (p ? { ...p, isDatabase: updated.isDatabase } : p));
    await refreshSidebar();
  }

  if (notFound) {
    return (
      <div className="p-16 text-muted-foreground">This page doesn&apos;t exist.</div>
    );
  }
  if (!page) {
    return <div className="p-16 text-muted-foreground/60">Loading…</div>;
  }

  return (
    <div className="max-w-3xl mx-auto px-16 py-14">
      {page.parent && (
        <Link
          href={`/pages/${page.parent.id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3 transition-colors"
        >
          <ChevronLeft className="size-4" />
          {page.parent.title || "Untitled"}
        </Link>
      )}

      <input
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          saveTitle(e.target.value);
        }}
        onBlur={(e) => {
          api.updatePage(pageId, { title: e.target.value || "Untitled" }).then(refreshSidebar);
        }}
        placeholder="Untitled"
        className="w-full bg-transparent text-4xl font-bold tracking-tight outline-none placeholder:text-muted-foreground/40 mb-8"
      />

      {page.isDatabase ? (
        <DatabaseView page={page} onChange={load} />
      ) : (
        <>
          <BlockEditor page={page} onChange={load} />
          <div className="mt-12 pt-4 border-t border-border">
            <button
              onClick={makeDatabase}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Table2 className="size-3.5" />
              Turn into database
            </button>
          </div>
        </>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Table2 } from "lucide-react";
import { api } from "@/lib/api-client";
import { usePages } from "@/lib/pages-context";
import type { PageDetail } from "@/lib/types";
import { BlockEditor } from "./BlockEditor";
import { DatabaseView } from "./DatabaseView";
import { useDebouncedCallback } from "@/lib/use-debounced-callback";

export function PageView({ pageId }: { pageId: string }) {
  const { pages, peekSeed, takeSeed, patchPageLocal } = usePages();
  const [page, setPage] = useState<PageDetail | null>(null);
  const [title, setTitle] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [renderedId, setRenderedId] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  // Adjust state the instant the route's page id changes (React's render-time
  // "reset state on prop change" pattern). A freshly-created page paints from
  // its seed immediately; navigating to an existing page shows its title right
  // away instead of a blank loader. peekSeed is a pure read, safe during render.
  if (pageId !== renderedId) {
    setRenderedId(pageId);
    const seed = peekSeed(pageId);
    if (seed) {
      setPage(seed);
      setTitle(seed.title);
    } else {
      setPage(null);
      setTitle(pages.find((p) => p.id === pageId)?.title ?? "");
    }
    setNotFound(false);
  }

  // Fetch and reconcile with the server, used as the self-heal path too.
  const resync = useCallback(() => {
    api.getPage(pageId).then(
      (data) => {
        setPage(data);
        setNotFound(false);
      },
      () => {}
    );
  }, [pageId]);

  useEffect(() => {
    let cancelled = false;
    // A freshly-created page is already painted from its seed, and its content
    // is driven by optimistic local state + background writes — refetching the
    // near-empty row now would only risk clobbering those edits, so trust the
    // seed and just focus the title. (Consuming the seed makes a later revisit
    // refetch instead.)
    if (takeSeed(pageId) !== undefined) {
      titleRef.current?.focus();
      return;
    }

    // Retry on failure: navigation may momentarily beat a page's creation.
    let attempts = 0;
    const load = () => {
      api.getPage(pageId).then(
        (data) => {
          if (cancelled) return;
          setPage(data);
          if (document.activeElement !== titleRef.current) setTitle(data.title);
          setNotFound(false);
        },
        () => {
          if (cancelled) return;
          attempts += 1;
          if (attempts < 6) setTimeout(load, 150);
          else setNotFound(true);
        }
      );
    };
    load();

    return () => {
      cancelled = true;
    };
  }, [pageId, takeSeed]);

  const saveTitle = useDebouncedCallback((value: string) => {
    api.updatePage(pageId, { title: value || "Untitled" }).catch(() => {});
  }, 500);

  function handleTitleChange(value: string) {
    setTitle(value);
    setPage((p) => (p ? { ...p, title: value } : p));
    patchPageLocal(pageId, { title: value || "Untitled" });
    saveTitle(value);
  }

  function makeDatabase() {
    setPage((p) => (p ? { ...p, isDatabase: true } : p));
    patchPageLocal(pageId, { isDatabase: true });
    api.updatePage(pageId, { isDatabase: true }).catch(() => resync());
  }

  const mutate = useCallback((fn: (p: PageDetail) => PageDetail) => {
    setPage((prev) => (prev ? fn(prev) : prev));
  }, []);

  if (notFound) {
    return (
      <div className="p-16 text-muted-foreground">This page doesn&apos;t exist.</div>
    );
  }

  const isDatabase =
    page?.isDatabase ?? pages.find((p) => p.id === pageId)?.isDatabase ?? false;
  const parent = page?.parent;

  return (
    <div className="max-w-3xl mx-auto px-16 py-14">
      {parent && (
        <Link
          href={`/pages/${parent.id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3 transition-colors"
        >
          <ChevronLeft className="size-4" />
          {parent.title || "Untitled"}
        </Link>
      )}

      <input
        ref={titleRef}
        value={title}
        onChange={(e) => handleTitleChange(e.target.value)}
        onBlur={(e) =>
          api.updatePage(pageId, { title: e.target.value || "Untitled" }).catch(() => {})
        }
        placeholder="Untitled"
        className="w-full bg-transparent font-display text-4xl font-bold tracking-tight outline-none placeholder:text-muted-foreground/40 mb-8"
      />

      {page === null ? (
        // Header already shows the title; the body fills in on the next tick.
        <div className="h-6" />
      ) : isDatabase ? (
        <DatabaseView page={page} mutate={mutate} resync={resync} />
      ) : (
        <>
          <BlockEditor page={page} mutate={mutate} resync={resync} />
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

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { api } from "@/lib/api-client";
import { useDebouncedCallback } from "@/lib/use-debounced-callback";
import type { SearchHit } from "@/lib/search";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { SearchResults } from "./SearchResults";

/*
 * Global command-palette-style search. Controlled from the sidebar; ⌘K/Ctrl-K
 * toggles it. Debounces the query, races out stale responses, and drives
 * keyboard nav (↑/↓/Enter) over the results list.
 */
export function SearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  // Monotonic token so late responses can't overwrite fresher ones.
  const requestSeq = useRef(0);

  // Reset state when the dialog closes (render-time "reset on prop change"
  // pattern) so a re-open starts blank without a cascading effect.
  if (wasOpen !== open) {
    setWasOpen(open);
    if (!open) {
      setQuery("");
      setHits([]);
      setActiveIndex(0);
    }
  }

  // Invalidate any in-flight request when the dialog closes, so a slow response
  // from a previous session can't paint into a fresh one. Refs go in an effect.
  useEffect(() => {
    if (!open) requestSeq.current++;
  }, [open]);

  const runSearch = useDebouncedCallback((q: string) => {
    const seq = ++requestSeq.current;
    if (!q.trim()) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    api.search(q, 20).then(
      (data) => {
        if (seq !== requestSeq.current) return;
        setHits(data);
        setActiveIndex(0);
        setLoading(false);
      },
      () => {
        if (seq !== requestSeq.current) return;
        setHits([]);
        setLoading(false);
      }
    );
  }, 150);

  function handleQueryChange(next: string) {
    setQuery(next);
    runSearch(next);
  }

  function pick(hit: SearchHit) {
    onOpenChange(false);
    router.push(`/pages/${hit.pageId}`);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && hits.length > 0) {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % hits.length);
    } else if (e.key === "ArrowUp" && hits.length > 0) {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + hits.length) % hits.length);
    } else if (e.key === "Enter" && hits[activeIndex]) {
      e.preventDefault();
      pick(hits[activeIndex]);
    }
  }

  const showHits = hits.length > 0;
  const showEmpty = !loading && query.trim().length > 0 && hits.length === 0;
  const showHint = !loading && query.trim().length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 overflow-hidden" hideCloseButton>
        {/* Radix needs a title/description for a11y even when hidden visually. */}
        <DialogTitle className="sr-only">Search</DialogTitle>
        <DialogDescription className="sr-only">
          Search page titles and block content across your workspace.
        </DialogDescription>
        <div className="flex items-center gap-2.5 px-3.5 h-12 border-b border-border">
          <Search className="size-4 text-muted-foreground shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search titles and content…"
            className="flex-1 bg-transparent outline-none text-[15px] placeholder:text-muted-foreground/60"
          />
        </div>
        <div className="max-h-[50vh] overflow-y-auto">
          {showHits && (
            <SearchResults
              hits={hits}
              activeIndex={activeIndex}
              onHover={setActiveIndex}
              onSelect={pick}
            />
          )}
          {showEmpty && (
            <div className="px-4 py-6 text-center text-[13px] text-muted-foreground">
              No matches for &ldquo;{query.trim()}&rdquo;.
            </div>
          )}
          {showHint && (
            <div className="px-4 py-6 text-center text-[13px] text-muted-foreground">
              Search titles and block content across your workspace.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

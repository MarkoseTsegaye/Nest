"use client";

import { FileText, Type } from "lucide-react";
import { cn } from "@/lib/utils";
import { renderSnippetHtml, type SearchHit } from "@/lib/search";

/*
 * Renders one flat list of search hits. Keyboard focus is driven from the
 * dialog via `activeIndex` — we only style; we don't own selection state.
 */
export function SearchResults({
  hits,
  activeIndex,
  onHover,
  onSelect,
}: {
  hits: SearchHit[];
  activeIndex: number;
  onHover: (index: number) => void;
  onSelect: (hit: SearchHit) => void;
}) {
  return (
    <ul role="listbox" className="py-1">
      {hits.map((hit, i) => {
        const active = i === activeIndex;
        const Icon = hit.kind === "page" ? FileText : Type;
        return (
          <li
            key={`${hit.kind}:${hit.blockId ?? hit.pageId}`}
            role="option"
            aria-selected={active}
            onMouseEnter={() => onHover(i)}
            onClick={() => onSelect(hit)}
            className={cn(
              "flex items-start gap-3 px-3 py-2 cursor-pointer transition-colors",
              active && "bg-accent"
            )}
          >
            <Icon className="size-4 mt-0.5 text-muted-foreground shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-sm text-foreground truncate">
                {hit.title || "Untitled"}
              </div>
              <div
                className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground truncate [&_mark]:bg-primary/20 [&_mark]:text-foreground [&_mark]:rounded [&_mark]:px-0.5"
                dangerouslySetInnerHTML={{ __html: renderSnippetHtml(hit.snippet) }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

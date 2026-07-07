"use client";

import { X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { OPERATORS, type Filter } from "@/lib/view-state";
import type { DatabaseProperty } from "@/lib/types";
import { FilterEditor } from "./FilterEditor";

/*
 * One active filter, rendered as a compact chip. Clicking the label opens a
 * dropdown to refine the op/value; the X removes the filter entirely.
 */
export function FilterChip({
  filter,
  property,
  onChange,
  onRemove,
}: {
  filter: Filter;
  property: DatabaseProperty;
  onChange: (next: Filter) => void;
  onRemove: () => void;
}) {
  const opLabel =
    OPERATORS[property.type].find((o) => o.op === filter.op)?.label ?? filter.op;

  return (
    <div className="inline-flex items-center h-7 rounded-md bg-secondary text-sm">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="h-7 px-2.5 rounded-l-md hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            <span className="text-muted-foreground">{property.name}</span>
            <span className="mx-1.5 text-muted-foreground/70">{opLabel}</span>
            <span className="text-foreground max-w-[10rem] inline-block align-bottom truncate">
              {summarize(filter) || <span className="text-muted-foreground/50">…</span>}
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="p-2"
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <FilterEditor filter={filter} property={property} onChange={onChange} />
        </DropdownMenuContent>
      </DropdownMenu>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove filter"
        className="h-7 w-7 flex items-center justify-center rounded-r-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

function summarize(filter: Filter): string {
  if (filter.op === "between") return `${filter.value[0] || "…"} → ${filter.value[1] || "…"}`;
  return filter.value;
}

"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { cycleSort, type Sort } from "@/lib/view-state";

/*
 * Table header cell whose click cycles the sort state: none → asc → desc → none.
 * Renders a lucide arrow that fades in on hover and stays lit when active,
 * matching the design skill's "quiet until interacted" hover pattern.
 */
export function SortableHeader({
  by,
  label,
  sort,
  onSort,
  className,
}: {
  by: string;
  label: string;
  sort: Sort | null;
  onSort: (next: Sort | null) => void;
  className?: string;
}) {
  const active = sort?.by === by ? sort.dir : null;

  return (
    <th
      className={cn(
        "text-left font-medium text-muted-foreground px-3 py-2 select-none",
        className
      )}
    >
      <button
        type="button"
        onClick={() => onSort(cycleSort(sort, by))}
        aria-label={`Sort by ${label}`}
        className="group inline-flex items-center gap-1.5 rounded text-left transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <span>{label}</span>
        {active === "asc" ? (
          <ArrowUp className="size-3.5 text-foreground" />
        ) : active === "desc" ? (
          <ArrowDown className="size-3.5 text-foreground" />
        ) : (
          <ArrowUpDown className="size-3.5 opacity-0 group-hover:opacity-50 transition-opacity" />
        )}
      </button>
    </th>
  );
}

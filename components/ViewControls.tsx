"use client";

import type { Filter } from "@/lib/view-state";
import type { DatabaseProperty } from "@/lib/types";
import { FilterBar } from "./FilterBar";

/*
 * Thin toolbar rendered above the database table. Currently just the filter
 * bar — sort UX lives inline on the column headers. Kept as a separate
 * component so future affordances (row count, saved views, etc.) have a home.
 */
export function ViewControls({
  filters,
  properties,
  onAdd,
  onUpdate,
  onRemove,
}: {
  filters: Filter[];
  properties: DatabaseProperty[];
  onAdd: (filter: Filter) => void;
  onUpdate: (index: number, filter: Filter) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="mb-3 min-h-8">
      <FilterBar
        filters={filters}
        properties={properties}
        onAdd={onAdd}
        onUpdate={onUpdate}
        onRemove={onRemove}
      />
    </div>
  );
}

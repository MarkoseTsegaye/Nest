"use client";

import type { Filter } from "@/lib/view-state";
import { propertyById } from "@/lib/view-state";
import type { DatabaseProperty } from "@/lib/types";
import { AddFilterMenu } from "./AddFilterMenu";
import { FilterChip } from "./FilterChip";

/*
 * Row of active filter chips plus the "Add filter" trigger. A filter whose
 * property was deleted is dropped upstream (in view-state.decode), so every
 * chip here is guaranteed to resolve.
 */
export function FilterBar({
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
    <div className="flex flex-wrap items-center gap-1.5">
      {filters.map((filter, i) => {
        const property = propertyById(properties, filter.propertyId);
        if (!property) return null;
        return (
          <FilterChip
            key={i}
            filter={filter}
            property={property}
            onChange={(next) => onUpdate(i, next)}
            onRemove={() => onRemove(i)}
          />
        );
      })}
      <AddFilterMenu properties={properties} onAdd={onAdd} />
    </div>
  );
}

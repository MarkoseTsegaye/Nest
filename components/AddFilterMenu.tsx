"use client";

import { Calendar, Filter as FilterIcon, List, Type } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { defaultFilterFor, type Filter } from "@/lib/view-state";
import type { DatabaseProperty, PropertyType } from "@/lib/types";

const TYPE_ICON: Record<PropertyType, React.ComponentType<{ className?: string }>> = {
  text: Type,
  select: List,
  date: Calendar,
};

/*
 * "+ Add filter" trigger. Clicking opens a menu of properties; picking one
 * appends a default filter which the user can then refine via its chip.
 */
export function AddFilterMenu({
  properties,
  onAdd,
}: {
  properties: DatabaseProperty[];
  onAdd: (filter: Filter) => void;
}) {
  if (properties.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <FilterIcon className="size-3.5" />
          Add filter
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {properties.map((property) => {
          const Icon = TYPE_ICON[property.type];
          return (
            <DropdownMenuItem
              key={property.id}
              onSelect={() => onAdd(defaultFilterFor(property))}
            >
              <Icon />
              {property.name}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OPERATORS, type Filter } from "@/lib/view-state";
import type { DatabaseProperty } from "@/lib/types";

/*
 * The body of an "edit this filter" panel — op picker (when the property type
 * has more than one op) + the appropriate value input. Shared by FilterChip and
 * reused inside AddFilterMenu after a property is chosen.
 */
export function FilterEditor({
  filter,
  property,
  onChange,
}: {
  filter: Filter;
  property: DatabaseProperty;
  onChange: (next: Filter) => void;
}) {
  const ops = OPERATORS[property.type];
  const showOpPicker = ops.length > 1;

  return (
    <div className="w-64 space-y-2 p-1">
      {showOpPicker && (
        <Select
          value={filter.op}
          onValueChange={(next) => onChange(convertOp(filter, property, next as Filter["op"]))}
        >
          <SelectTrigger className="h-8 border border-input px-3">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ops.map(({ op, label }) => (
              <SelectItem key={op} value={op}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <ValueInput filter={filter} property={property} onChange={onChange} />
    </div>
  );
}

// Rewrite the filter to the target op, preserving whatever value slot survives.
function convertOp(
  filter: Filter,
  property: DatabaseProperty,
  nextOp: Filter["op"]
): Filter {
  if (property.type !== "date") return filter; // only date has multiple ops
  if (nextOp === "between") {
    const existing = filter.op === "between" ? filter.value : ["", ""];
    return { propertyId: property.id, type: "date", op: "between", value: existing as [string, string] };
  }
  if (nextOp === "before" || nextOp === "after") {
    const existing = filter.op === "between" ? filter.value[0] : (filter as { value: string }).value;
    return { propertyId: property.id, type: "date", op: nextOp, value: existing };
  }
  return filter;
}

function ValueInput({
  filter,
  property,
  onChange,
}: {
  filter: Filter;
  property: DatabaseProperty;
  onChange: (next: Filter) => void;
}) {
  if (filter.type === "text") {
    return <DebouncedTextInput filter={filter} onChange={onChange} />;
  }
  if (filter.type === "select") {
    const options: string[] = JSON.parse(property.selectOptions || "[]");
    return (
      <Select
        value={filter.value || undefined}
        onValueChange={(next) => onChange({ ...filter, value: next })}
      >
        <SelectTrigger className="h-8 border border-input px-3">
          <SelectValue placeholder="Pick an option" />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt} value={opt}>
              {opt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (filter.op === "between") {
    return (
      <div className="flex items-center gap-1.5">
        <input
          type="date"
          value={filter.value[0]}
          onChange={(e) => onChange({ ...filter, value: [e.target.value, filter.value[1]] })}
          className="h-8 w-full min-w-0 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/60 [color-scheme:dark]"
        />
        <span className="text-xs text-muted-foreground">to</span>
        <input
          type="date"
          value={filter.value[1]}
          onChange={(e) => onChange({ ...filter, value: [filter.value[0], e.target.value] })}
          className="h-8 w-full min-w-0 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/60 [color-scheme:dark]"
        />
      </div>
    );
  }
  return (
    <input
      type="date"
      value={filter.value}
      onChange={(e) => onChange({ ...filter, value: e.target.value })}
      className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/60 [color-scheme:dark]"
    />
  );
}

// Text filter value: buffered locally + committed on blur/Enter so the URL
// isn't rewritten on every keystroke.
function DebouncedTextInput({
  filter,
  onChange,
}: {
  filter: Extract<Filter, { type: "text" }>;
  onChange: (next: Filter) => void;
}) {
  const [value, setValue] = useState(filter.value);
  function commit() {
    if (value !== filter.value) onChange({ ...filter, value });
  }
  return (
    <Input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        }
      }}
      placeholder="Type to filter…"
      className="h-8"
    />
  );
}

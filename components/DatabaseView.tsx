"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { Calendar, Plus } from "lucide-react";
import { api } from "@/lib/api-client";
import { usePages } from "@/lib/pages-context";
import { newId } from "@/lib/id";
import { useDebouncedCallback } from "@/lib/use-debounced-callback";
import { useRecordAction } from "@/lib/use-page-history";
import { cn } from "@/lib/utils";
import { useViewState } from "@/lib/use-view-state";
import { run, TITLE_KEY } from "@/lib/view-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DatabaseProperty, PageDetail, PropertyType, RowPage } from "@/lib/types";
import { SortableHeader } from "./SortableHeader";
import { ViewControls } from "./ViewControls";

function cellValue(row: RowPage, propertyId: string) {
  return row.propertyValues.find((v) => v.propertyId === propertyId)?.value ?? "";
}

function Cell({
  row,
  property,
  onCommitValue,
}: {
  row: RowPage;
  property: DatabaseProperty;
  onCommitValue: (rowId: string, propertyId: string, value: string | null) => void;
}) {
  const [value, setValue] = useState(cellValue(row, property.id));
  // Resync when the cell's stored value changes upstream (undo/redo mutating
  // the row's propertyValues from PageView). Render-time pattern; skip when
  // this cell is the currently focused input.
  const incoming = cellValue(row, property.id);
  const [syncedValue, setSyncedValue] = useState<string>(incoming);
  const cellDomId = `cell-${row.id}-${property.id}`;
  if (syncedValue !== incoming) {
    setSyncedValue(incoming);
    if (typeof document !== "undefined" && document.activeElement?.id !== cellDomId) {
      setValue(incoming);
    }
  }
  const record = useRecordAction();
  // For text cells: value at focus time; supports "one undo per edit session".
  const editStartValue = useRef<string>(value);

  const debouncedSave = useDebouncedCallback((next: string) => {
    api.setPropertyValue(row.id, property.id, next || null).catch(() => {});
  }, 600);

  function saveNow(next: string) {
    api.setPropertyValue(row.id, property.id, next || null).catch(() => {});
  }

  /** Record + save an atomic (non-text-typing) cell change. */
  function commitAtomic(next: string) {
    const before = value;
    setValue(next);
    saveNow(next);
    if (before !== next) {
      // Mirror into the parent so undo has a real "after" to revert from.
      onCommitValue(row.id, property.id, next || null);
      record({
        kind: "set-property-value",
        rowId: row.id,
        propertyId: property.id,
        before: before || null,
        after: next || null,
      });
    }
  }

  if (property.type === "select") {
    const options: string[] = JSON.parse(property.selectOptions || "[]");
    return (
      <Select value={value || undefined} onValueChange={commitAtomic}>
        <SelectTrigger className="border-0 shadow-none h-9 rounded-none px-3">
          <SelectValue placeholder="—" />
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

  if (property.type === "date") {
    return (
      <div className="flex items-center gap-1.5 px-3">
        <Calendar className="size-3.5 text-muted-foreground shrink-0" />
        <input
          type="date"
          value={value}
          onChange={(e) => commitAtomic(e.target.value)}
          className="w-full bg-transparent outline-none text-sm py-2 text-foreground [color-scheme:dark]"
        />
      </div>
    );
  }

  // text: record one action per edit session (focus → blur), and flush any
  // pending debounced save before the blur write so it can't overwrite an undo.
  return (
    <input
      id={cellDomId}
      type="text"
      value={value}
      onChange={(e) => {
        setValue(e.target.value);
        debouncedSave(e.target.value);
      }}
      onFocus={() => {
        editStartValue.current = value;
      }}
      onBlur={(e) => {
        debouncedSave.cancel();
        const next = e.target.value;
        saveNow(next);
        const before = editStartValue.current;
        if (before !== next) {
          onCommitValue(row.id, property.id, next || null);
          record({
            kind: "set-property-value",
            rowId: row.id,
            propertyId: property.id,
            before: before || null,
            after: next || null,
          });
        }
        editStartValue.current = next;
      }}
      placeholder="Empty"
      className="w-full bg-transparent outline-none text-sm px-3 py-2 placeholder:text-muted-foreground/40"
    />
  );
}

function AddPropertyForm({
  onAdd,
}: {
  onAdd: (input: { name: string; type: PropertyType; selectOptions: string[] }) => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<PropertyType>("text");
  const [options, setOptions] = useState("");

  function submit() {
    if (!name.trim()) return;
    onAdd({
      name: name.trim(),
      type,
      selectOptions:
        type === "select"
          ? options.split(",").map((o) => o.trim()).filter(Boolean)
          : [],
    });
  }

  return (
    <div className="w-64 space-y-2.5 p-1">
      <Input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="Property name"
        className="h-8"
      />
      <Select value={type} onValueChange={(v) => setType(v as PropertyType)}>
        <SelectTrigger className="h-8 border border-input px-3">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="text">Text</SelectItem>
          <SelectItem value="select">Select</SelectItem>
          <SelectItem value="date">Date</SelectItem>
        </SelectContent>
      </Select>
      {type === "select" && (
        <Input
          value={options}
          onChange={(e) => setOptions(e.target.value)}
          placeholder="Options, comma-separated"
          className="h-8"
        />
      )}
      <Button onClick={submit} size="sm" className="w-full">
        Add property
      </Button>
    </div>
  );
}

export function DatabaseView({
  page,
  mutate,
  resync,
}: {
  page: PageDetail;
  mutate: (fn: (p: PageDetail) => PageDetail) => void;
  resync: () => void;
}) {
  const { createPage } = usePages();
  const record = useRecordAction();
  const [addingProperty, setAddingProperty] = useState(false);
  const { state, setSort, addFilter, updateFilter, removeFilter } = useViewState(
    page.properties
  );
  const visibleRows = run(page.children, state);

  // Mirror an edited cell value into the parent's page.children so undo/redo
  // has real "before"/"after" state to swap between (same reason BlockRow's
  // onCommitContent exists).
  const commitValue = useCallback(
    (rowId: string, propertyId: string, next: string | null) => {
      mutate((p) => ({
        ...p,
        children: p.children.map((row) => {
          if (row.id !== rowId) return row;
          const existing = row.propertyValues.find((v) => v.propertyId === propertyId);
          if (existing) {
            return {
              ...row,
              propertyValues: row.propertyValues.map((v) =>
                v.propertyId === propertyId ? { ...v, value: next } : v
              ),
            };
          }
          const property = p.properties.find((pr) => pr.id === propertyId);
          if (!property) return row;
          return {
            ...row,
            propertyValues: [
              ...row.propertyValues,
              {
                id: `${rowId}:${propertyId}`,
                pageId: rowId,
                propertyId,
                value: next,
                property,
              },
            ],
          };
        }),
      }));
    },
    [mutate]
  );

  function addRow() {
    // A row is just a page under the database — createPage persists it and adds
    // it to the sidebar tree; we mirror it into the table immediately here.
    const row = createPage({ parentId: page.id, title: "Untitled" });
    const rowPage: RowPage = {
      id: row.id,
      title: row.title,
      parentId: page.id,
      isDatabase: false,
      propertyValues: [],
    };
    const index = page.children.length;
    mutate((p) => ({ ...p, children: [...p.children, rowPage] }));
    record({
      kind: "create-row",
      rowId: row.id,
      databasePageId: page.id,
      index,
      title: row.title,
    });
  }

  function addProperty(input: { name: string; type: PropertyType; selectOptions: string[] }) {
    setAddingProperty(false);
    const id = newId();
    const property: DatabaseProperty = {
      id,
      pageId: page.id,
      name: input.name,
      type: input.type,
      order: page.properties.reduce((max, p) => Math.max(max, p.order), -1) + 1,
      selectOptions: JSON.stringify(input.selectOptions),
    };
    mutate((p) => ({ ...p, properties: [...p.properties, property] }));
    api
      .createProperty(page.id, {
        id,
        name: input.name,
        type: input.type,
        selectOptions: input.selectOptions,
      })
      .catch(() => resync());
  }

  return (
    <div>
      <ViewControls
        filters={state.filters}
        properties={page.properties}
        onAdd={addFilter}
        onUpdate={updateFilter}
        onRemove={removeFilter}
      />
      <div className="overflow-x-auto -mx-2">
      <div className="min-w-full inline-block px-2">
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <SortableHeader
                  by={TITLE_KEY}
                  label="Name"
                  sort={state.sort}
                  onSort={setSort}
                  className="w-64"
                />
                {page.properties.map((property) => (
                  <SortableHeader
                    key={property.id}
                    by={property.id}
                    label={property.name}
                    sort={state.sort}
                    onSort={setSort}
                    className="min-w-[150px] border-l border-border"
                  />
                ))}
                <th className="w-11 border-l border-border px-1">
                  <DropdownMenu open={addingProperty} onOpenChange={setAddingProperty}>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground mx-auto transition-colors"
                        title="Add property"
                      >
                        <Plus className="size-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="p-2">
                      <AddPropertyForm onAdd={addProperty} />
                    </DropdownMenuContent>
                  </DropdownMenu>
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={page.properties.length + 2}
                    className="px-3 py-6 text-center text-muted-foreground text-[13px]"
                  >
                    {page.children.length === 0
                      ? "No rows yet."
                      : "No rows match the current filter."}
                  </td>
                </tr>
              ) : (
                visibleRows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-border last:border-b-0 hover:bg-accent/50 transition-colors"
                  >
                    <td className="px-3 py-1">
                      <Link
                        href={`/pages/${row.id}`}
                        className="font-medium hover:underline underline-offset-2"
                      >
                        {row.title || "Untitled"}
                      </Link>
                    </td>
                    {page.properties.map((property) => (
                      <td
                        key={property.id}
                        className={cn("border-l border-border align-middle")}
                      >
                        <Cell row={row} property={property} onCommitValue={commitValue} />
                      </td>
                    ))}
                    <td className="border-l border-border" />
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <button
          onClick={addRow}
          className="mt-2 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors px-1"
        >
          <Plus className="size-3.5" />
          New row
        </button>
      </div>
      </div>
    </div>
  );
}

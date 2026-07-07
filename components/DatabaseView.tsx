"use client";

import { useState } from "react";
import Link from "next/link";
import { Calendar, Plus } from "lucide-react";
import { api } from "@/lib/api-client";
import { usePages } from "@/lib/pages-context";
import { newId } from "@/lib/id";
import { useDebouncedCallback } from "@/lib/use-debounced-callback";
import { cn } from "@/lib/utils";
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

function cellValue(row: RowPage, propertyId: string) {
  return row.propertyValues.find((v) => v.propertyId === propertyId)?.value ?? "";
}

function Cell({
  row,
  property,
}: {
  row: RowPage;
  property: DatabaseProperty;
}) {
  const [value, setValue] = useState(cellValue(row, property.id));

  const debouncedSave = useDebouncedCallback((next: string) => {
    api.setPropertyValue(row.id, property.id, next || null).catch(() => {});
  }, 600);

  function saveNow(next: string) {
    api.setPropertyValue(row.id, property.id, next || null).catch(() => {});
  }

  if (property.type === "select") {
    const options: string[] = JSON.parse(property.selectOptions || "[]");
    return (
      <Select
        value={value || undefined}
        onValueChange={(next) => {
          setValue(next);
          saveNow(next);
        }}
      >
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
          onChange={(e) => {
            setValue(e.target.value);
            saveNow(e.target.value);
          }}
          className="w-full bg-transparent outline-none text-sm py-2 text-foreground [color-scheme:dark]"
        />
      </div>
    );
  }

  return (
    <input
      type="text"
      value={value}
      onChange={(e) => {
        setValue(e.target.value);
        debouncedSave(e.target.value);
      }}
      onBlur={(e) => saveNow(e.target.value)}
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
  const [addingProperty, setAddingProperty] = useState(false);

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
    mutate((p) => ({ ...p, children: [...p.children, rowPage] }));
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
    <div className="overflow-x-auto -mx-2">
      <div className="min-w-full inline-block px-2">
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left font-medium text-muted-foreground px-3 py-2 w-64">
                  Name
                </th>
                {page.properties.map((property) => (
                  <th
                    key={property.id}
                    className="text-left font-medium text-muted-foreground px-3 py-2 min-w-[150px] border-l border-border"
                  >
                    {property.name}
                  </th>
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
              {page.children.length === 0 ? (
                <tr>
                  <td
                    colSpan={page.properties.length + 2}
                    className="px-3 py-6 text-center text-muted-foreground text-[13px]"
                  >
                    No rows yet.
                  </td>
                </tr>
              ) : (
                page.children.map((row) => (
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
                        <Cell row={row} property={property} />
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
  );
}

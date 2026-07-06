"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api-client";
import { usePages } from "@/lib/pages-context";
import { useDebouncedCallback } from "@/lib/use-debounced-callback";
import type { DatabaseProperty, PageDetail, PropertyType, RowPage } from "@/lib/types";

function cellValue(row: RowPage, propertyId: string) {
  return row.propertyValues.find((v) => v.propertyId === propertyId)?.value ?? "";
}

function Cell({
  row,
  property,
  onChange,
}: {
  row: RowPage;
  property: DatabaseProperty;
  onChange: () => void;
}) {
  const [value, setValue] = useState(cellValue(row, property.id));

  const debouncedSave = useDebouncedCallback((next: string) => {
    api.setPropertyValue(row.id, property.id, next || null);
  }, 600);

  function saveNow(next: string) {
    api.setPropertyValue(row.id, property.id, next || null).then(onChange);
  }

  if (property.type === "select") {
    const options: string[] = JSON.parse(property.selectOptions || "[]");
    return (
      <select
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          saveNow(e.target.value);
        }}
        className="w-full bg-transparent outline-none text-sm px-2 py-1.5 cursor-pointer"
      >
        <option value="">—</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }

  if (property.type === "date") {
    return (
      <input
        type="date"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          saveNow(e.target.value);
        }}
        className="w-full bg-transparent outline-none text-sm px-2 py-1.5"
      />
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
      className="w-full bg-transparent outline-none text-sm px-2 py-1.5"
    />
  );
}

function AddPropertyForm({
  pageId,
  onDone,
}: {
  pageId: string;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<PropertyType>("text");
  const [options, setOptions] = useState("");

  async function submit() {
    if (!name.trim()) return;
    await api.createProperty(pageId, {
      name: name.trim(),
      type,
      selectOptions:
        type === "select"
          ? options.split(",").map((o) => o.trim()).filter(Boolean)
          : undefined,
    });
    onDone();
  }

  return (
    <div className="absolute right-0 top-full mt-1 z-10 w-64 rounded border border-gray-200 bg-white shadow-lg p-3 text-sm space-y-2">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Property name"
        className="w-full border border-gray-200 rounded px-2 py-1 outline-none"
      />
      <select
        value={type}
        onChange={(e) => setType(e.target.value as PropertyType)}
        className="w-full border border-gray-200 rounded px-2 py-1 outline-none"
      >
        <option value="text">Text</option>
        <option value="select">Select</option>
        <option value="date">Date</option>
      </select>
      {type === "select" && (
        <input
          value={options}
          onChange={(e) => setOptions(e.target.value)}
          placeholder="Options, comma-separated"
          className="w-full border border-gray-200 rounded px-2 py-1 outline-none"
        />
      )}
      <button
        onClick={submit}
        className="w-full rounded bg-gray-800 text-white py-1 hover:bg-gray-700"
      >
        Add property
      </button>
    </div>
  );
}

export function DatabaseView({ page, onChange }: { page: PageDetail; onChange: () => void }) {
  const { refresh: refreshSidebar } = usePages();
  const [addingProperty, setAddingProperty] = useState(false);

  async function addRow() {
    await api.createPage({ parentId: page.id, title: "Untitled" });
    onChange();
    await refreshSidebar();
  }

  async function finishAddProperty() {
    setAddingProperty(false);
    onChange();
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-left font-medium text-gray-500 px-2 py-1.5 w-64">Name</th>
            {page.properties.map((property) => (
              <th
                key={property.id}
                className="text-left font-medium text-gray-500 px-2 py-1.5 min-w-[140px]"
              >
                {property.name}
              </th>
            ))}
            <th className="relative w-10 px-2 py-1.5">
              <button
                onClick={() => setAddingProperty((v) => !v)}
                className="text-gray-400 hover:text-gray-600"
                title="Add property"
              >
                +
              </button>
              {addingProperty && (
                <AddPropertyForm pageId={page.id} onDone={finishAddProperty} />
              )}
            </th>
          </tr>
        </thead>
        <tbody>
          {page.children.map((row) => (
            <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="px-2 py-1.5">
                <Link href={`/pages/${row.id}`} className="hover:underline">
                  {row.title || "Untitled"}
                </Link>
              </td>
              {page.properties.map((property) => (
                <td key={property.id} className="border-l border-gray-100">
                  <Cell row={row} property={property} onChange={onChange} />
                </td>
              ))}
              <td />
            </tr>
          ))}
        </tbody>
      </table>
      <button
        onClick={addRow}
        className="mt-2 text-xs text-gray-400 hover:text-gray-600 px-2"
      >
        + New row
      </button>
    </div>
  );
}

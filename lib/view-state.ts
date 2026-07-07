import type { DatabaseProperty, PropertyType, RowPage } from "./types";

/*
 * Client-side filter and sort state for the database view. All computation is
 * pure — the URL is the source of truth, `use-view-state` bridges it into
 * React, and DatabaseView applies `run` to the fetched rows.
 */

export const TITLE_KEY = "title";

export type TextFilter = { propertyId: string; type: "text"; op: "contains"; value: string };
export type SelectFilter = { propertyId: string; type: "select"; op: "equals"; value: string };
export type DateBoundFilter = { propertyId: string; type: "date"; op: "before" | "after"; value: string };
export type DateBetweenFilter = { propertyId: string; type: "date"; op: "between"; value: [string, string] };
export type Filter = TextFilter | SelectFilter | DateBoundFilter | DateBetweenFilter;

export type Sort = { by: string; dir: "asc" | "desc" };
export type ViewState = { sort: Sort | null; filters: Filter[] };

export const EMPTY_STATE: ViewState = { sort: null, filters: [] };

// Operator catalog per property type, keyed by the on-screen label.
export const OPERATORS: Record<PropertyType, { op: Filter["op"]; label: string }[]> = {
  text: [{ op: "contains", label: "contains" }],
  select: [{ op: "equals", label: "is" }],
  date: [
    { op: "before", label: "before" },
    { op: "after", label: "after" },
    { op: "between", label: "between" },
  ],
};

// ---------- URL <-> ViewState ----------

// Encodes just the value slot so `.` and `~` inside a value can't be confused
// with our field separators.
function encodeFilter(f: Filter): string {
  const raw = f.op === "between" ? `${f.value[0]}~${f.value[1]}` : f.value;
  return `${f.propertyId}.${f.op}.${encodeURIComponent(raw)}`;
}

function decodeFilter(
  raw: string,
  properties: DatabaseProperty[]
): Filter | null {
  const [propertyId, op, ...rest] = raw.split(".");
  if (!propertyId || !op || rest.length === 0) return null;
  const value = decodeURIComponent(rest.join("."));

  const property = properties.find((p) => p.id === propertyId);
  if (!property) return null; // property was deleted; drop the filter silently

  const allowed = OPERATORS[property.type].map((o) => o.op);
  if (!allowed.includes(op as Filter["op"])) return null;

  if (property.type === "text" && op === "contains") {
    return { propertyId, type: "text", op, value };
  }
  if (property.type === "select" && op === "equals") {
    return { propertyId, type: "select", op, value };
  }
  if (property.type === "date") {
    if (op === "before" || op === "after") {
      return { propertyId, type: "date", op, value };
    }
    if (op === "between") {
      const [from, to] = value.split("~");
      if (!from || !to) return null;
      return { propertyId, type: "date", op: "between", value: [from, to] };
    }
  }
  return null;
}

function encodeSort(sort: Sort): string {
  return `${sort.by}.${sort.dir}`;
}

function decodeSort(
  raw: string,
  properties: DatabaseProperty[]
): Sort | null {
  const [by, dir] = raw.split(".");
  if (!by || (dir !== "asc" && dir !== "desc")) return null;
  if (by !== TITLE_KEY && !properties.find((p) => p.id === by)) return null;
  return { by, dir };
}

export function encode(state: ViewState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.sort) params.set("sort", encodeSort(state.sort));
  for (const filter of state.filters) params.append("filter", encodeFilter(filter));
  return params;
}

export function decode(
  params: URLSearchParams | ReadonlyURLSearchParamsLike,
  properties: DatabaseProperty[]
): ViewState {
  const sortRaw = params.get("sort");
  const sort = sortRaw ? decodeSort(sortRaw, properties) : null;
  const filters = params
    .getAll("filter")
    .map((raw) => decodeFilter(raw, properties))
    .filter((f): f is Filter => f !== null);
  return { sort, filters };
}

// Next's `useSearchParams` returns a ReadonlyURLSearchParams; keep the helper
// tolerant of both without depending on next/navigation from a lib module.
interface ReadonlyURLSearchParamsLike {
  get(name: string): string | null;
  getAll(name: string): string[];
}

// ---------- Filtering & sorting ----------

function cellValue(row: RowPage, propertyId: string): string | null {
  return row.propertyValues.find((v) => v.propertyId === propertyId)?.value ?? null;
}

// A row is kept only if every filter matches. Empty cell values never match —
// so filtering also naturally serves as a "not empty" check.
function matches(row: RowPage, filter: Filter): boolean {
  const cell = cellValue(row, filter.propertyId);
  if (cell === null || cell === "") return false;

  switch (filter.op) {
    case "contains":
      return cell.toLowerCase().includes(filter.value.toLowerCase());
    case "equals":
      return cell === filter.value;
    case "before":
      return filter.value !== "" && cell < filter.value;
    case "after":
      return filter.value !== "" && cell > filter.value;
    case "between": {
      const [from, to] = filter.value;
      if (!from || !to) return false;
      return cell >= from && cell <= to;
    }
  }
}

// Sort comparator. Nulls always sort last regardless of direction, so an
// unset cell doesn't outrank a real one.
function compare(a: RowPage, b: RowPage, sort: Sort): number {
  const aVal = sort.by === TITLE_KEY ? a.title : cellValue(a, sort.by);
  const bVal = sort.by === TITLE_KEY ? b.title : cellValue(b, sort.by);
  const aEmpty = aVal === null || aVal === "";
  const bEmpty = bVal === null || bVal === "";
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;
  const cmp = (aVal as string).localeCompare(bVal as string, undefined, {
    numeric: true,
    sensitivity: "base",
  });
  return sort.dir === "asc" ? cmp : -cmp;
}

export function run(rows: RowPage[], state: ViewState): RowPage[] {
  const filtered = state.filters.length
    ? rows.filter((row) => state.filters.every((f) => matches(row, f)))
    : rows;
  if (!state.sort) return filtered;
  // Copy so we don't mutate the source array.
  return [...filtered].sort((a, b) => compare(a, b, state.sort!));
}

// ---------- Small helpers used by the UI ----------

// Cycles a column's sort state on click: none → asc → desc → none.
export function cycleSort(current: Sort | null, by: string): Sort | null {
  if (current?.by !== by) return { by, dir: "asc" };
  if (current.dir === "asc") return { by, dir: "desc" };
  return null;
}

// A minimal filter for the given property, using its first operator; used by
// AddFilterMenu when the user picks a property to filter on.
export function defaultFilterFor(property: DatabaseProperty): Filter {
  switch (property.type) {
    case "text":
      return { propertyId: property.id, type: "text", op: "contains", value: "" };
    case "select": {
      const options: string[] = JSON.parse(property.selectOptions || "[]");
      return { propertyId: property.id, type: "select", op: "equals", value: options[0] ?? "" };
    }
    case "date":
      return { propertyId: property.id, type: "date", op: "before", value: "" };
  }
}

export function propertyById(properties: DatabaseProperty[], id: string): DatabaseProperty | undefined {
  return properties.find((p) => p.id === id);
}

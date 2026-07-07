"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import type { DatabaseProperty } from "./types";
import {
  decode,
  encode,
  EMPTY_STATE,
  type Filter,
  type Sort,
  type ViewState,
} from "./view-state";

export function useViewState(properties: DatabaseProperty[]) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const state: ViewState = useMemo(
    () => (searchParams ? decode(searchParams, properties) : EMPTY_STATE),
    [searchParams, properties]
  );

  // Rewrite the URL to reflect `next`. Preserves unrelated params, uses
  // router.replace (no history entry per keystroke), keeps scroll position.
  const commit = useCallback(
    (next: ViewState) => {
      const encoded = encode(next);
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.delete("sort");
      params.delete("filter");
      const nextSort = encoded.get("sort");
      if (nextSort) params.set("sort", nextSort);
      for (const f of encoded.getAll("filter")) params.append("filter", f);
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const setSort = useCallback(
    (sort: Sort | null) => commit({ ...state, sort }),
    [commit, state]
  );

  const addFilter = useCallback(
    (filter: Filter) => commit({ ...state, filters: [...state.filters, filter] }),
    [commit, state]
  );

  const updateFilter = useCallback(
    (index: number, filter: Filter) => {
      const filters = state.filters.slice();
      filters[index] = filter;
      commit({ ...state, filters });
    },
    [commit, state]
  );

  const removeFilter = useCallback(
    (index: number) =>
      commit({ ...state, filters: state.filters.filter((_, i) => i !== index) }),
    [commit, state]
  );

  const clear = useCallback(() => commit(EMPTY_STATE), [commit]);

  return { state, setSort, addFilter, updateFilter, removeFilter, clear };
}

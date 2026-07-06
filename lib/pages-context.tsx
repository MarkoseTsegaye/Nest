"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "./api-client";
import type { PageSummary } from "./types";

interface PagesContextValue {
  pages: PageSummary[];
  refresh: () => Promise<void>;
}

const PagesContext = createContext<PagesContextValue | null>(null);

export function PagesProvider({ children }: { children: React.ReactNode }) {
  const [pages, setPages] = useState<PageSummary[]>([]);

  const refresh = useCallback(async () => {
    setPages(await api.listPages());
  }, []);

  useEffect(() => {
    api.listPages().then(setPages);
  }, []);

  return (
    <PagesContext.Provider value={{ pages, refresh }}>{children}</PagesContext.Provider>
  );
}

export function usePages() {
  const ctx = useContext(PagesContext);
  if (!ctx) throw new Error("usePages must be used within a PagesProvider");
  return ctx;
}

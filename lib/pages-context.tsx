"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { api } from "./api-client";
import { newId } from "./id";
import type { PageDetail, PageSummary } from "./types";

interface CreatePageInput {
  id?: string;
  parentId?: string | null;
  title?: string;
  /** When false, the caller persists the page some other way (e.g. a
   *  page_link block create also creates its linked page). Defaults to true. */
  persist?: boolean;
}

interface PagesContextValue {
  pages: PageSummary[];
  refresh: () => Promise<void>;
  /** Optimistically add a page to the tree and return its summary immediately. */
  createPage: (input?: CreatePageInput) => PageSummary;
  /** Optimistically remove a page (and its descendants) from the tree. */
  deletePage: (id: string) => void;
  /** Patch a page's sidebar summary in place (e.g. live title while typing). */
  patchPageLocal: (
    id: string,
    patch: Partial<Pick<PageSummary, "title" | "isDatabase">>
  ) => void;
  /** Read the stashed detail for a freshly-created page without consuming it. */
  peekSeed: (id: string) => PageDetail | undefined;
  /** Consume the stashed detail so a later revisit refetches instead of reusing. */
  takeSeed: (id: string) => PageDetail | undefined;
}

const PagesContext = createContext<PagesContextValue | null>(null);

export function PagesProvider({ children }: { children: React.ReactNode }) {
  const [pages, setPages] = useState<PageSummary[]>([]);
  // Full details for pages that were just created on the client, keyed by id.
  // PageView consumes these to render without waiting for a server round-trip.
  const seeds = useRef<Map<string, PageDetail>>(new Map());
  // Always-current snapshot of `pages` for use inside stable callbacks.
  const pagesRef = useRef<PageSummary[]>(pages);
  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  const refresh = useCallback(async () => {
    try {
      setPages(await api.listPages());
    } catch {
      // Keep the current tree if the refresh fails; it will retry on next action.
    }
  }, []);

  useEffect(() => {
    api.listPages().then(setPages, () => {});
  }, []);

  const createPage = useCallback((input: CreatePageInput = {}) => {
    const id = input.id ?? newId();
    const parentId = input.parentId ?? null;
    const title = input.title ?? "Untitled";
    // Every fresh page ships with one empty text block ready to type in
    // (server creates it in the same transaction; we seed it here too so the
    // block appears instantly). Client-minted id keeps identity stable.
    const defaultBlockId = newId();
    const summary: PageSummary = {
      id,
      title,
      parentId,
      isDatabase: false,
      createdAt: new Date().toISOString(),
    };

    setPages((prev) => [...prev, summary]);

    const parent = parentId
      ? pagesRef.current.find((p) => p.id === parentId)
      : null;
    seeds.current.set(id, {
      id,
      title,
      parentId,
      isDatabase: false,
      parent: parent ? { id: parent.id, title: parent.title } : null,
      blocks: [
        {
          id: defaultBlockId,
          pageId: id,
          type: "text",
          order: 0,
          content: [],
          headingLevel: null,
          linkedPageId: null,
          linkedPage: null,
        },
      ],
      properties: [],
      propertyValues: [],
      children: [],
    });

    if (input.persist !== false) {
      api
        .createPage({ id, title, parentId: parentId ?? undefined, defaultBlockId })
        .catch(() => refresh());
    }

    return summary;
  }, [refresh]);

  const deletePage = useCallback((id: string) => {
    setPages((prev) => {
      const removed = new Set<string>([id]);
      // Walk down the tree removing every descendant of the deleted page.
      let grew = true;
      while (grew) {
        grew = false;
        for (const p of prev) {
          if (p.parentId && removed.has(p.parentId) && !removed.has(p.id)) {
            removed.add(p.id);
            grew = true;
          }
        }
      }
      return prev.filter((p) => !removed.has(p.id));
    });
    seeds.current.delete(id);
    api.deletePage(id).catch(() => refresh());
  }, [refresh]);

  const patchPageLocal = useCallback(
    (id: string, patch: Partial<Pick<PageSummary, "title" | "isDatabase">>) => {
      setPages((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    },
    []
  );

  const peekSeed = useCallback((id: string) => seeds.current.get(id), []);

  const takeSeed = useCallback((id: string) => {
    const seed = seeds.current.get(id);
    if (seed) seeds.current.delete(id);
    return seed;
  }, []);

  return (
    <PagesContext.Provider
      value={{ pages, refresh, createPage, deletePage, patchPageLocal, peekSeed, takeSeed }}
    >
      {children}
    </PagesContext.Provider>
  );
}

export function usePages() {
  const ctx = useContext(PagesContext);
  if (!ctx) throw new Error("usePages must be used within a PagesProvider");
  return ctx;
}

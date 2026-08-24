"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { useParams } from "next/navigation";
import { PanelRightClose } from "lucide-react";
import { api } from "@/lib/api-client";
import type { GraphResponse } from "@/lib/graph-types";
import { cn } from "@/lib/utils";
import { GraphView } from "./GraphView";

/*
 * Collapsible right-side panel for the page graph. Open/closed state lives at
 * the layout level (via context) so the toggle in the page header can drive it,
 * and it persists in localStorage so it survives a reload. The panel width
 * transitions with CSS so the main column shifts smoothly.
 */

const STORAGE_KEY = "nest:graphOpen";

interface GraphSidebarContextValue {
  open: boolean;
  toggle: () => void;
  setOpen: (open: boolean) => void;
}

const GraphSidebarContext = createContext<GraphSidebarContextValue | null>(null);

// External-store hydration for the persisted "open" flag. The server always
// returns false so SSR is stable; the client picks up the real value on first
// paint via useSyncExternalStore without an in-effect setState cascade.
function subscribeToStorage(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
}
function readPersistedOpen(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}
function serverPersistedOpen(): boolean {
  return false;
}

export function GraphSidebarProvider({ children }: { children: React.ReactNode }) {
  const persisted = useSyncExternalStore(
    subscribeToStorage,
    readPersistedOpen,
    serverPersistedOpen
  );
  // The user's in-session choice takes precedence over the persisted value.
  const [override, setOverride] = useState<boolean | null>(null);
  const open = override ?? persisted;

  const setOpen = useCallback((next: boolean) => {
    setOverride(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      // localStorage may be disabled (private mode) — the in-session state
      // still works; there's just no persistence.
    }
  }, []);
  const toggle = useCallback(() => setOpen(!open), [setOpen, open]);

  return (
    <GraphSidebarContext.Provider value={{ open, toggle, setOpen }}>
      {children}
    </GraphSidebarContext.Provider>
  );
}

export function useGraphSidebar(): GraphSidebarContextValue {
  const ctx = useContext(GraphSidebarContext);
  if (!ctx) throw new Error("useGraphSidebar must be used within GraphSidebarProvider");
  return ctx;
}

export function GraphSidebar() {
  const { open, setOpen } = useGraphSidebar();
  const params = useParams<{ id?: string }>();
  const pageId = params?.id ?? null;
  const [graph, setGraph] = useState<GraphResponse | null>(null);
  const [loading, setLoading] = useState(false);

  // Render-time reset when the fetch key changes — clears the stale graph and
  // flips `loading` on immediately so the panel shows a spinner between
  // navigation and the async response.
  const fetchKey = open && pageId ? pageId : null;
  const [renderedKey, setRenderedKey] = useState<string | null>(null);
  if (renderedKey !== fetchKey) {
    setRenderedKey(fetchKey);
    setGraph(null);
    setLoading(fetchKey !== null);
  }

  useEffect(() => {
    if (!fetchKey) return;
    let cancelled = false;
    api.getPageGraph(fetchKey).then(
      (data) => {
        if (cancelled) return;
        setGraph(data);
        setLoading(false);
      },
      () => {
        if (cancelled) return;
        setGraph(null);
        setLoading(false);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [fetchKey]);

  return (
    <aside
      className={cn(
        "shrink-0 h-screen overflow-hidden bg-sidebar border-l border-border",
        "transition-[width] duration-200 ease-out",
        open ? "w-80" : "w-0"
      )}
      aria-hidden={!open}
    >
      <div className="w-80 h-full flex flex-col">
        <div className="h-12 px-4 flex items-center justify-between border-b border-border shrink-0">
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="font-display text-base font-extrabold tracking-tight">
              Graph
            </span>
            {graph && (
              <span className="text-xs text-muted-foreground/70 truncate">
                {connectionSummary(graph)}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors shrink-0"
            aria-label="Close graph"
            title="Close graph"
          >
            <PanelRightClose className="size-4" />
          </button>
        </div>
        {pageId === null ? (
          <div className="flex-1 flex items-center justify-center px-4 text-sm text-center text-muted-foreground/60">
            Open a page to see its graph.
          </div>
        ) : (
          <>
            <GraphView graph={graph} loading={loading} />
            <Legend />
          </>
        )}
      </div>
    </aside>
  );
}

/** Human-readable count line for the header, e.g. "3 nested · 1 linked". Falls
 *  back to a friendly nudge when the page stands alone. */
function connectionSummary(graph: GraphResponse): string {
  let nested = 0;
  let linked = 0;
  for (const e of graph.edges) {
    if (e.kind === "hierarchy") nested += 1;
    else linked += 1;
  }
  const parts: string[] = [];
  if (nested) parts.push(`${nested} nested`);
  if (linked) parts.push(`${linked} linked`);
  return parts.length ? parts.join(" · ") : "standalone";
}

function Legend() {
  return (
    <div className="px-4 py-3 border-t border-border flex items-center gap-4 text-[11px] text-muted-foreground shrink-0">
      <span className="flex items-center gap-1.5">
        <svg width="18" height="4" aria-hidden>
          <line x1="0" y1="2" x2="18" y2="2" stroke="var(--primary)" strokeWidth="1.5" />
        </svg>
        Nesting
      </span>
      <span className="flex items-center gap-1.5">
        <svg width="18" height="4" aria-hidden>
          <line
            x1="0"
            y1="2"
            x2="18"
            y2="2"
            stroke="var(--muted-foreground)"
            strokeWidth="1"
            strokeDasharray="2 3"
          />
        </svg>
        Page link
      </span>
    </div>
  );
}

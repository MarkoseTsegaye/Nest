"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight, Network, Redo2, Table2, Undo2 } from "lucide-react";
import { api } from "@/lib/api-client";
import { usePages } from "@/lib/pages-context";
import type { PageDetail, PropertyValue, RowPage } from "@/lib/types";
import { BlockEditor } from "./BlockEditor";
import { DatabaseView } from "./DatabaseView";
import { useDebouncedCallback } from "@/lib/use-debounced-callback";
import { RecordActionProvider, usePageHistory } from "@/lib/use-page-history";
import { useGraphSidebar } from "./GraphSidebar";
import type { Action } from "@/lib/undo-redo";
import { isEmptyContent } from "@/lib/block-content";
import { cn } from "@/lib/utils";

export function PageView({ pageId }: { pageId: string }) {
  const { pages, peekSeed, takeSeed, patchPageLocal, createPage, deletePage } = usePages();
  const [page, setPage] = useState<PageDetail | null>(null);
  const [title, setTitle] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [renderedId, setRenderedId] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  // Adjust state the instant the route's page id changes (React's render-time
  // "reset state on prop change" pattern). A freshly-created page paints from
  // its seed immediately; navigating to an existing page shows its title right
  // away instead of a blank loader. peekSeed is a pure read, safe during render.
  if (pageId !== renderedId) {
    setRenderedId(pageId);
    const seed = peekSeed(pageId);
    if (seed) {
      setPage(seed);
      setTitle(seed.title);
    } else {
      setPage(null);
      setTitle(pages.find((p) => p.id === pageId)?.title ?? "");
    }
    setNotFound(false);
  }

  // Fetch and reconcile with the server, used as the self-heal path too.
  const resync = useCallback(() => {
    api.getPage(pageId).then(
      (data) => {
        setPage(data);
        setNotFound(false);
      },
      () => {}
    );
  }, [pageId]);

  useEffect(() => {
    let cancelled = false;
    // A freshly-created page is already painted from its seed, and its content
    // is driven by optimistic local state + background writes — refetching the
    // near-empty row now would only risk clobbering those edits, so trust the
    // seed and just focus the title. (Consuming the seed makes a later revisit
    // refetch instead.)
    if (takeSeed(pageId) !== undefined) {
      titleRef.current?.focus();
      return;
    }

    // Retry on failure: navigation may momentarily beat a page's creation.
    let attempts = 0;
    const load = () => {
      api.getPage(pageId).then(
        (data) => {
          if (cancelled) return;
          setPage(data);
          if (document.activeElement !== titleRef.current) setTitle(data.title);
          setNotFound(false);
        },
        () => {
          if (cancelled) return;
          attempts += 1;
          if (attempts < 6) setTimeout(load, 150);
          else setNotFound(true);
        }
      );
    };
    load();

    return () => {
      cancelled = true;
    };
  }, [pageId, takeSeed]);

  const saveTitle = useDebouncedCallback((value: string) => {
    api.updatePage(pageId, { title: value || "Untitled" }).catch(() => {});
  }, 500);

  function handleTitleChange(value: string) {
    setTitle(value);
    setPage((p) => (p ? { ...p, title: value } : p));
    patchPageLocal(pageId, { title: value || "Untitled" });
    saveTitle(value);
  }

  function makeDatabase() {
    setPage((p) => (p ? { ...p, isDatabase: true } : p));
    patchPageLocal(pageId, { isDatabase: true });
    api.updatePage(pageId, { isDatabase: true }).catch(() => resync());
  }

  const mutate = useCallback((fn: (p: PageDetail) => PageDetail) => {
    setPage((prev) => (prev ? fn(prev) : prev));
  }, []);

  /*
   * Invert (or reapply) an Action. `direction` picks which side of the pair to
   * apply. Each branch does two things:
   *   1) mutate optimistic local state so the UI updates immediately
   *   2) fire the corresponding server write (the api-client's ordering layer
   *      still applies, so writes stay consistent with any pending creates).
   */
  const applyAction = useCallback(
    (action: Action, direction: "undo" | "redo") => {
      switch (action.kind) {
        case "edit-block-content": {
          const target = direction === "undo" ? action.before : action.after;
          mutate((p) => ({
            ...p,
            blocks: p.blocks.map((b) =>
              b.id === action.blockId ? { ...b, content: target } : b
            ),
          }));
          api.updateBlock(action.blockId, { content: target }).catch(() => resync());
          return;
        }
        case "create-block": {
          if (direction === "undo") {
            // Take back the block: remove locally, delete on the server. The
            // api-client's afterCreate() serializer ensures the DELETE waits
            // for any in-flight CREATE with the same id.
            mutate((p) => ({
              ...p,
              blocks: p.blocks.filter((b) => b.id !== action.block.id),
            }));
            api.deleteBlock(action.block.id).catch(() => resync());
          } else {
            // Redo: put it back at its original slot and re-create on the server.
            mutate((p) => {
              const blocks = p.blocks.slice();
              const at = Math.min(action.index, blocks.length);
              blocks.splice(at, 0, action.block);
              return { ...p, blocks };
            });
            api
              .createBlock(action.block.pageId, {
                id: action.block.id,
                type: action.block.type,
                content: action.block.content ?? undefined,
                headingLevel: action.block.headingLevel ?? undefined,
              })
              .catch(() => resync());
          }
          return;
        }
        case "delete-block": {
          if (direction === "undo") {
            // Splice the block back into the visible list at its old slot
            // (clamped in case earlier blocks disappeared meanwhile).
            mutate((p) => {
              const blocks = p.blocks.slice();
              const at = Math.min(action.index, blocks.length);
              blocks.splice(at, 0, action.block);
              return { ...p, blocks };
            });
            api
              .createBlock(action.block.pageId, {
                id: action.block.id,
                type: action.block.type,
                content: action.block.content ?? undefined,
                headingLevel: action.block.headingLevel ?? undefined,
                linkedPageId: action.block.linkedPageId ?? undefined,
              })
              .catch(() => resync());
          } else {
            mutate((p) => ({
              ...p,
              blocks: p.blocks.filter((b) => b.id !== action.block.id),
            }));
            api.deleteBlock(action.block.id).catch(() => resync());
          }
          return;
        }
        case "create-row": {
          if (direction === "undo") {
            // Remove the row from the database's visible list AND drop the page
            // from the sidebar tree. deletePage handles the server DELETE and
            // ripples via the api-client's ordering serializer.
            mutate((p) => ({
              ...p,
              children: p.children.filter((r) => r.id !== action.rowId),
            }));
            deletePage(action.rowId);
          } else {
            // Redo: recreate the row page under the database and splice it back
            // into the database's children at its original slot.
            createPage({
              id: action.rowId,
              parentId: action.databasePageId,
              title: action.title,
            });
            mutate((p) => {
              const restored: RowPage = {
                id: action.rowId,
                title: action.title,
                parentId: action.databasePageId,
                isDatabase: false,
                propertyValues: [],
              };
              const children = p.children.slice();
              const at = Math.min(action.index, children.length);
              children.splice(at, 0, restored);
              return { ...p, children };
            });
          }
          return;
        }
        case "set-property-value": {
          const target = direction === "undo" ? action.before : action.after;
          mutate((p) => ({
            ...p,
            children: p.children.map((row) => {
              if (row.id !== action.rowId) return row;
              const existing = row.propertyValues.find(
                (v) => v.propertyId === action.propertyId
              );
              let propertyValues: PropertyValue[];
              if (existing) {
                propertyValues = row.propertyValues.map((v) =>
                  v.propertyId === action.propertyId ? { ...v, value: target } : v
                );
              } else {
                // No local PropertyValue yet — the server will upsert on the
                // PUT below; carry a synthetic row so the UI reflects it.
                const property = p.properties.find((pr) => pr.id === action.propertyId);
                if (!property) return row;
                propertyValues = [
                  ...row.propertyValues,
                  {
                    id: `${action.rowId}:${action.propertyId}`,
                    pageId: action.rowId,
                    propertyId: action.propertyId,
                    value: target,
                    property,
                  },
                ];
              }
              return { ...row, propertyValues };
            }),
          }));
          api
            .setPropertyValue(action.rowId, action.propertyId, target)
            .catch(() => resync());
          return;
        }
      }
    },
    [mutate, resync, createPage, deletePage]
  );

  const history = usePageHistory(pageId, applyAction);
  const graphSidebar = useGraphSidebar();

  // Global ⌘Z / Ctrl-Z (redo with Shift). Skip when the user is in an input or
  // textarea so native text undo still fixes typos inside a block or cell.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z" || e.repeat) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      e.preventDefault();
      if (e.shiftKey) history.redo();
      else history.undo();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [history]);

  // Full ancestor trail (root → immediate parent), walked up the sidebar tree
  // by parentId. Mirrors Notion's breadcrumb rather than just the one parent.
  // Computed before any early return so hook order stays stable.
  const ancestors = useMemo(() => {
    const trail: { id: string; title: string }[] = [];
    const seen = new Set<string>();
    let pid = page?.parentId ?? pages.find((p) => p.id === pageId)?.parentId ?? null;
    while (pid && !seen.has(pid)) {
      seen.add(pid);
      const p = pages.find((x) => x.id === pid);
      if (!p) break;
      trail.unshift({ id: p.id, title: p.title });
      pid = p.parentId;
    }
    return trail;
  }, [pages, page?.parentId, pageId]);

  if (notFound) {
    return (
      <div className="p-16 text-muted-foreground">This page doesn&apos;t exist.</div>
    );
  }

  const isDatabase =
    page?.isDatabase ?? pages.find((p) => p.id === pageId)?.isDatabase ?? false;

  return (
    <div className="max-w-3xl mx-auto px-16 py-14">
      <div className="flex items-start justify-between gap-2 mb-3">
        {ancestors.length > 0 ? (
          <nav className="flex items-center gap-1 text-sm text-muted-foreground min-w-0">
            {ancestors.map((a, i) => (
              <Fragment key={a.id}>
                {i > 0 && (
                  <ChevronRight className="size-3.5 shrink-0 opacity-50" />
                )}
                <Link
                  href={`/pages/${a.id}`}
                  className="truncate max-w-[12rem] hover:text-foreground transition-colors"
                >
                  {a.title || "Untitled"}
                </Link>
              </Fragment>
            ))}
          </nav>
        ) : (
          <div />
        )}
        <div className="flex items-center gap-0.5">
          <UndoRedoButton
            label="Undo"
            hint="⌘Z"
            onClick={history.undo}
            disabled={!history.canUndo}
            icon={<Undo2 className="size-4" />}
          />
          <UndoRedoButton
            label="Redo"
            hint="⇧⌘Z"
            onClick={history.redo}
            disabled={!history.canRedo}
            icon={<Redo2 className="size-4" />}
          />
          <button
            type="button"
            onClick={graphSidebar.toggle}
            aria-pressed={graphSidebar.open}
            title="Graph view"
            aria-label="Toggle graph view"
            className={cn(
              "flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors",
              "hover:bg-accent hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
              graphSidebar.open && "bg-accent text-foreground"
            )}
          >
            <Network className="size-4" />
          </button>
        </div>
      </div>

      <input
        ref={titleRef}
        value={title}
        onChange={(e) => handleTitleChange(e.target.value)}
        onBlur={(e) =>
          api.updatePage(pageId, { title: e.target.value || "Untitled" }).catch(() => {})
        }
        placeholder="Untitled"
        className="w-full bg-transparent font-display text-4xl font-bold tracking-tight outline-none placeholder:text-muted-foreground/40 mb-8"
      />

      <RecordActionProvider value={history.record}>
        {page === null ? (
          // Header already shows the title; the body fills in on the next tick.
          <div className="h-6" />
        ) : isDatabase ? (
          <DatabaseView page={page} mutate={mutate} resync={resync} />
        ) : (
          <>
            <BlockEditor page={page} mutate={mutate} resync={resync} />
            {/* Only surface "Turn into database" while the page is still
                effectively empty (only the default text block, and it's blank)
                — the affordance is confusing on a page with real notes on it. */}
            {isEffectivelyEmpty(page) && (
              <div className="mt-12 pt-4 border-t border-border">
                <button
                  onClick={makeDatabase}
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Table2 className="size-3.5" />
                  Turn into database
                </button>
              </div>
            )}
          </>
        )}
      </RecordActionProvider>
    </div>
  );
}

/**
 * A page is "effectively empty" when it has no non-empty text/heading/list
 * blocks and no page_link blocks. The default text block a fresh page ships
 * with counts as empty as long as the user hasn't typed anything.
 */
function isEffectivelyEmpty(page: PageDetail): boolean {
  return page.blocks.every(
    (b) => b.type !== "page_link" && isEmptyContent(b.content ?? [])
  );
}

function UndoRedoButton({
  label,
  hint,
  onClick,
  disabled,
  icon,
}: {
  label: string;
  hint: string;
  onClick: () => void;
  disabled: boolean;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={`${label} (${hint})`}
      aria-label={label}
      className={cn(
        "flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors",
        "hover:bg-accent hover:text-foreground",
        "disabled:opacity-40 disabled:pointer-events-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      )}
    >
      {icon}
    </button>
  );
}

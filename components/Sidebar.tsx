"use client";

import { useRouter, useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  FileText,
  Plus,
  Search,
  Table2,
  Trash2,
} from "lucide-react";
import { usePages } from "@/lib/pages-context";
import { cn } from "@/lib/utils";
import type { PageSummary } from "@/lib/types";
import { SearchDialog } from "./SearchDialog";

function buildTree(pages: PageSummary[]) {
  const byParent = new Map<string | null, PageSummary[]>();
  for (const page of pages) {
    const key = page.parentId;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(page);
  }
  return byParent;
}

function TreeNode({
  page,
  byParent,
  depth,
}: {
  page: PageSummary;
  byParent: Map<string | null, PageSummary[]>;
  depth: number;
}) {
  const router = useRouter();
  const params = useParams<{ id?: string }>();
  const { createPage, deletePage } = usePages();
  const [collapsed, setCollapsed] = useState(false);
  const children = byParent.get(page.id) ?? [];
  const isActive = params?.id === page.id;
  const hasChildren = children.length > 0;

  function addChild(e: React.MouseEvent) {
    e.stopPropagation();
    const child = createPage({ parentId: page.id });
    setCollapsed(false);
    router.push(`/pages/${child.id}`);
  }

  function remove(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(`Delete "${page.title || "Untitled"}" and everything inside it?`)) return;
    deletePage(page.id);
    if (isActive) router.push("/");
  }

  return (
    <div>
      <div
        onClick={() => router.push(`/pages/${page.id}`)}
        className={cn(
          "group flex items-center gap-1 rounded-md pr-1 h-7 text-sm cursor-pointer text-sidebar-foreground/80 hover:bg-accent transition-colors",
          isActive && "bg-accent text-foreground font-medium"
        )}
        style={{ paddingLeft: depth * 12 + 4 }}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) setCollapsed((c) => !c);
          }}
          className="flex size-4 shrink-0 items-center justify-center text-muted-foreground"
        >
          {hasChildren && (
            <ChevronRight
              className={cn(
                "size-3.5 transition-transform",
                !collapsed && "rotate-90"
              )}
            />
          )}
        </button>
        {page.isDatabase ? (
          <Table2 className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <FileText className="size-4 shrink-0 text-muted-foreground" />
        )}
        <span className="truncate flex-1 py-1">{page.title || "Untitled"}</span>
        <span className="hidden group-hover:flex items-center gap-0.5 shrink-0">
          <button
            onClick={addChild}
            title="Add sub-page"
            className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <Plus className="size-3.5" />
          </button>
          <button
            onClick={remove}
            title="Delete page"
            className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
          </button>
        </span>
      </div>
      {!collapsed && hasChildren && (
        <div>
          {children.map((child) => (
            <TreeNode key={child.id} page={child} byParent={byParent} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const { pages, createPage } = usePages();
  const router = useRouter();
  const byParent = useMemo(() => buildTree(pages), [pages]);
  const roots = byParent.get(null) ?? [];
  const [searchOpen, setSearchOpen] = useState(false);

  // Global ⌘K / Ctrl-K toggles the search palette; ignore repeats and skip when
  // the user is holding it down inside an input that has its own handling.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey) && !e.repeat) {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function createRootPage() {
    const page = createPage({});
    router.push(`/pages/${page.id}`);
  }

  return (
    <aside className="w-64 shrink-0 h-screen flex flex-col bg-sidebar border-r border-border">
      <div className="px-4 h-12 flex items-center">
        <button
          onClick={() => router.push("/")}
          className="font-display text-base font-extrabold tracking-tight text-foreground"
        >
          Nest
        </button>
      </div>
      <div className="px-2 pt-1 pb-2">
        <button
          onClick={() => setSearchOpen(true)}
          className="w-full flex items-center gap-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground rounded-md px-2 h-8 transition-colors"
        >
          <Search className="size-4" />
          <span className="flex-1 text-left">Search</span>
          <kbd className="text-[10px] tracking-wider font-mono text-muted-foreground/70 bg-secondary px-1.5 py-0.5 rounded">
            ⌘K
          </kbd>
        </button>
      </div>
      <div className="flex-1 px-2 pb-2 overflow-y-auto">
        {roots.length === 0 ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">No pages yet.</p>
        ) : (
          roots.map((page) => (
            <TreeNode key={page.id} page={page} byParent={byParent} depth={0} />
          ))
        )}
      </div>
      <div className="p-2 border-t border-border">
        <button
          onClick={createRootPage}
          className="w-full flex items-center gap-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground rounded-md px-2 h-8 transition-colors"
        >
          <Plus className="size-4" />
          New page
        </button>
      </div>
      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </aside>
  );
}

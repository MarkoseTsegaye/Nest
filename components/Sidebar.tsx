"use client";

import { useRouter, useParams } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ChevronRight,
  FileText,
  Plus,
  Table2,
  Trash2,
} from "lucide-react";
import { usePages } from "@/lib/pages-context";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { PageSummary } from "@/lib/types";

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
  const { refresh } = usePages();
  const [collapsed, setCollapsed] = useState(false);
  const children = byParent.get(page.id) ?? [];
  const isActive = params?.id === page.id;
  const hasChildren = children.length > 0;

  async function addChild(e: React.MouseEvent) {
    e.stopPropagation();
    const child = await api.createPage({ parentId: page.id });
    await refresh();
    setCollapsed(false);
    router.push(`/pages/${child.id}`);
  }

  async function remove(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(`Delete "${page.title || "Untitled"}" and everything inside it?`)) return;
    await api.deletePage(page.id);
    await refresh();
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
  const { pages, refresh } = usePages();
  const router = useRouter();
  const byParent = useMemo(() => buildTree(pages), [pages]);
  const roots = byParent.get(null) ?? [];

  async function createRootPage() {
    const page = await api.createPage({});
    await refresh();
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
    </aside>
  );
}

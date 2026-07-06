"use client";

import { useRouter, useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { usePages } from "@/lib/pages-context";
import { api } from "@/lib/api-client";
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

  async function addChild(e: React.MouseEvent) {
    e.stopPropagation();
    const child = await api.createPage({ parentId: page.id });
    await refresh();
    setCollapsed(false);
    router.push(`/pages/${child.id}`);
  }

  async function remove(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(`Delete "${page.title}" and everything inside it?`)) return;
    await api.deletePage(page.id);
    await refresh();
    if (isActive) router.push("/");
  }

  return (
    <div>
      <div
        onClick={() => router.push(`/pages/${page.id}`)}
        className={`group flex items-center gap-1 rounded px-1 py-1 text-sm cursor-pointer hover:bg-gray-200/70 ${
          isActive ? "bg-gray-200/70 font-medium" : ""
        }`}
        style={{ paddingLeft: depth * 14 + 4 }}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            setCollapsed((c) => !c);
          }}
          className="w-4 h-4 flex items-center justify-center text-gray-400 shrink-0"
        >
          {children.length > 0 ? (collapsed ? "▸" : "▾") : ""}
        </button>
        <span className="shrink-0">{page.isDatabase ? "▤" : "📄"}</span>
        <span className="truncate flex-1">{page.title || "Untitled"}</span>
        <span className="hidden group-hover:flex items-center gap-1 shrink-0">
          <button
            onClick={addChild}
            title="Add sub-page"
            className="w-5 h-5 rounded hover:bg-gray-300/70 text-gray-500"
          >
            +
          </button>
          <button
            onClick={remove}
            title="Delete page"
            className="w-5 h-5 rounded hover:bg-gray-300/70 text-gray-500"
          >
            ×
          </button>
        </span>
      </div>
      {!collapsed && children.length > 0 && (
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
    <aside className="w-64 shrink-0 h-screen overflow-y-auto border-r border-gray-200 bg-gray-50 flex flex-col">
      <div className="px-3 py-3 text-sm font-semibold text-gray-700">
        <button onClick={() => router.push("/")} className="hover:underline">
          Nest
        </button>
      </div>
      <div className="flex-1 px-2 pb-2 overflow-y-auto">
        {roots.map((page) => (
          <TreeNode key={page.id} page={page} byParent={byParent} depth={0} />
        ))}
      </div>
      <div className="p-2 border-t border-gray-200">
        <button
          onClick={createRootPage}
          className="w-full text-left text-sm text-gray-500 hover:bg-gray-200/70 rounded px-2 py-1.5"
        >
          + New page
        </button>
      </div>
    </aside>
  );
}

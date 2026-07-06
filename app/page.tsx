"use client";

import { useRouter } from "next/navigation";
import { usePages } from "@/lib/pages-context";
import { api } from "@/lib/api-client";

export default function Home() {
  const router = useRouter();
  const { pages, refresh } = usePages();

  async function createPage() {
    const page = await api.createPage({});
    await refresh();
    router.push(`/pages/${page.id}`);
  }

  return (
    <div className="h-full flex items-center justify-center text-center px-6">
      <div>
        <p className="text-gray-400 mb-3">
          {pages.length === 0
            ? "No pages yet."
            : "Select a page from the sidebar, or create a new one."}
        </p>
        <button
          onClick={createPage}
          className="px-3 py-1.5 text-sm rounded border border-gray-300 hover:bg-gray-100"
        >
          + New page
        </button>
      </div>
    </div>
  );
}

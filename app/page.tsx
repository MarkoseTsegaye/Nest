"use client";

import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { usePages } from "@/lib/pages-context";
import { Button } from "@/components/ui/button";

export default function Home() {
  const router = useRouter();
  const { pages, createPage } = usePages();

  function handleCreate() {
    const page = createPage({});
    router.push(`/pages/${page.id}`);
  }

  return (
    <div className="h-full flex items-center justify-center text-center px-6">
      <div className="max-w-sm">
        <h1 className="text-2xl font-bold tracking-tight mb-2">Welcome to Nest</h1>
        <p className="text-muted-foreground mb-5 text-[15px] leading-relaxed">
          {pages.length === 0
            ? "A calm space for pages, blocks, and databases. Start with your first page."
            : "Pick a page from the sidebar, or start a new one."}
        </p>
        <Button onClick={handleCreate}>
          <Plus />
          New page
        </Button>
      </div>
    </div>
  );
}

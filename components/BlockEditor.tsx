"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FileText, Heading, Link2, Plus, Trash2, Type } from "lucide-react";
import { api } from "@/lib/api-client";
import { usePages } from "@/lib/pages-context";
import { useDebouncedCallback } from "@/lib/use-debounced-callback";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Block, PageDetail } from "@/lib/types";

const headingClasses: Record<number, string> = {
  1: "font-display text-2xl font-bold tracking-tight",
  2: "font-display text-xl font-bold tracking-tight",
  3: "font-display text-lg font-semibold tracking-tight",
};

function AutoTextarea({
  value,
  onChange,
  onBlur,
  className,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  className?: string;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      className={cn(
        "w-full resize-none bg-transparent outline-none overflow-hidden placeholder:text-muted-foreground/40",
        className
      )}
    />
  );
}

function BlockRow({
  block,
  onDelete,
}: {
  block: Block;
  onDelete: (id: string) => void;
}) {
  const [content, setContent] = useState(block.content ?? "");

  const debouncedSave = useDebouncedCallback((value: string) => {
    api.updateBlock(block.id, { content: value });
  }, 800);

  function handleChange(value: string) {
    setContent(value);
    debouncedSave(value);
  }

  function handleBlur() {
    api.updateBlock(block.id, { content });
  }

  if (block.type === "page_link") {
    return (
      <div className="group flex items-center gap-1 py-0.5">
        <Link
          href={`/pages/${block.linkedPageId}`}
          className="flex-1 flex items-center gap-2 rounded-md px-2.5 py-2 border border-border hover:bg-accent text-sm transition-colors"
        >
          <FileText className="size-4 text-muted-foreground shrink-0" />
          <span className="truncate">{block.linkedPage?.title || "Untitled"}</span>
        </Link>
        <button
          onClick={() => onDelete(block.id)}
          className="opacity-0 group-hover:opacity-100 flex size-6 items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-secondary shrink-0 transition-opacity"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    );
  }

  const isHeading = block.type === "heading";
  const className = isHeading
    ? headingClasses[block.headingLevel ?? 2]
    : "text-[15px] leading-relaxed";

  return (
    <div className="group flex items-start gap-1 py-0.5">
      <AutoTextarea
        value={content}
        onChange={handleChange}
        onBlur={handleBlur}
        className={cn("py-0.5", className)}
        placeholder={isHeading ? "Heading" : "Type something…"}
      />
      <button
        onClick={() => onDelete(block.id)}
        className="opacity-0 group-hover:opacity-100 flex size-6 items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-secondary shrink-0 mt-0.5 transition-opacity"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}

export function BlockEditor({ page, onChange }: { page: PageDetail; onChange: () => void }) {
  const { refresh: refreshSidebar } = usePages();

  async function addBlock(type: "text" | "heading") {
    await api.createBlock(page.id, {
      type,
      content: "",
      headingLevel: type === "heading" ? 2 : undefined,
    });
    onChange();
  }

  async function addPageLink() {
    await api.createBlock(page.id, { type: "page_link" });
    onChange();
    await refreshSidebar();
  }

  async function deleteBlock(id: string) {
    await api.deleteBlock(id);
    onChange();
    await refreshSidebar();
  }

  return (
    <div>
      <div className="space-y-0.5">
        {page.blocks.map((block) => (
          <BlockRow key={block.id} block={block} onDelete={deleteBlock} />
        ))}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="mt-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <Plus className="size-4" />
            Add block
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={() => addBlock("text")}>
            <Type />
            Text
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => addBlock("heading")}>
            <Heading />
            Heading
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={addPageLink}>
            <Link2 />
            Page link
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

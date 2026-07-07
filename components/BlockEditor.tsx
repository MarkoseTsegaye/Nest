"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FileText, Heading, Link2, Plus, Trash2, Type } from "lucide-react";
import { api } from "@/lib/api-client";
import { usePages } from "@/lib/pages-context";
import { newId } from "@/lib/id";
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

// A stable DOM id for a block's textarea, so focus can be handed to a freshly
// added block from the dropdown's onCloseAutoFocus (after Radix settles focus).
const blockFieldId = (id: string) => `block-field-${id}`;

function AutoTextarea({
  domId,
  value,
  onChange,
  onBlur,
  className,
  placeholder,
}: {
  domId: string;
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
      id={domId}
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
    api.updateBlock(block.id, { content: value }).catch(() => {});
  }, 800);

  function handleChange(value: string) {
    setContent(value);
    debouncedSave(value);
  }

  function handleBlur() {
    api.updateBlock(block.id, { content }).catch(() => {});
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
        domId={blockFieldId(block.id)}
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

export function BlockEditor({
  page,
  mutate,
  resync,
}: {
  page: PageDetail;
  mutate: (fn: (p: PageDetail) => PageDetail) => void;
  resync: () => void;
}) {
  const { createPage } = usePages();
  // The block to hand focus to once the "add block" menu finishes closing.
  const pendingFocus = useRef<string | null>(null);

  function nextOrder() {
    return page.blocks.reduce((max, b) => Math.max(max, b.order), -1) + 1;
  }

  function addBlock(type: "text" | "heading") {
    const id = newId();
    const block: Block = {
      id,
      pageId: page.id,
      type,
      order: nextOrder(),
      content: "",
      headingLevel: type === "heading" ? 2 : null,
      linkedPageId: null,
      linkedPage: null,
    };
    pendingFocus.current = id;
    mutate((p) => ({ ...p, blocks: [...p.blocks, block] }));
    api
      .createBlock(page.id, {
        id,
        type,
        content: "",
        headingLevel: type === "heading" ? 2 : undefined,
      })
      .catch(() => resync());
  }

  function addPageLink() {
    const blockId = newId();
    // Mint the linked page up front so it shows in the sidebar immediately; the
    // block create below persists that page too (persist: false here).
    const child = createPage({ parentId: page.id, title: "Untitled", persist: false });
    const block: Block = {
      id: blockId,
      pageId: page.id,
      type: "page_link",
      order: nextOrder(),
      content: null,
      headingLevel: null,
      linkedPageId: child.id,
      linkedPage: { id: child.id, title: child.title },
    };
    mutate((p) => ({ ...p, blocks: [...p.blocks, block] }));
    api
      .createBlock(page.id, { id: blockId, type: "page_link", linkedPageId: child.id })
      .catch(() => resync());
  }

  function deleteBlock(id: string) {
    mutate((p) => ({ ...p, blocks: p.blocks.filter((b) => b.id !== id) }));
    api.deleteBlock(id).catch(() => resync());
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
        <DropdownMenuContent
          onCloseAutoFocus={(e) => {
            // Radix would restore focus to the trigger here; instead hand focus
            // to the just-added block so the user can type into it right away.
            const id = pendingFocus.current;
            pendingFocus.current = null;
            if (id) {
              e.preventDefault();
              requestAnimationFrame(() =>
                document.getElementById(blockFieldId(id))?.focus()
              );
            }
          }}
        >
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

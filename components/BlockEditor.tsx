"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FileText, Heading, Link2, Plus, Trash2, Type } from "lucide-react";
import { api } from "@/lib/api-client";
import { usePages } from "@/lib/pages-context";
import { newId } from "@/lib/id";
import { useDebouncedCallback } from "@/lib/use-debounced-callback";
import { useRecordAction } from "@/lib/use-page-history";
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
  onFocus,
  onBlur,
  className,
  placeholder,
}: {
  domId: string;
  value: string;
  onChange: (value: string) => void;
  onFocus?: () => void;
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
      onFocus={onFocus}
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
  onCommitContent,
}: {
  block: Block;
  onDelete: (block: Block) => void;
  onCommitContent: (id: string, content: string) => void;
}) {
  const [content, setContent] = useState(block.content ?? "");
  // Resync local content when the block's content changes from outside the row
  // (e.g. an undo/redo mutating the block from PageView). Uses the render-time
  // reset pattern instead of an effect to keep the update synchronous.
  const [syncedContent, setSyncedContent] = useState<string>(block.content ?? "");
  const incoming = block.content ?? "";
  if (syncedContent !== incoming) {
    setSyncedContent(incoming);
    // Only stomp on local state when the textarea isn't the focused element —
    // otherwise we'd blow away in-flight keystrokes.
    if (typeof document !== "undefined" && document.activeElement?.id !== blockFieldId(block.id)) {
      setContent(incoming);
    }
  }
  // Value at focus time — used to record one undo entry per edit *session*
  // instead of per keystroke or per debounced save.
  const editStartValue = useRef<string>(block.content ?? "");
  const record = useRecordAction();

  const debouncedSave = useDebouncedCallback((value: string) => {
    api.updateBlock(block.id, { content: value }).catch(() => {});
  }, 800);

  function handleChange(value: string) {
    setContent(value);
    debouncedSave(value);
  }

  function handleFocus() {
    editStartValue.current = content;
  }

  function handleBlur() {
    // Flush pending debounced save first so it can't overwrite an undo that
    // fires right after this blur with the pre-edit value.
    debouncedSave.cancel();
    api.updateBlock(block.id, { content }).catch(() => {});
    const before = editStartValue.current;
    if (before !== content) {
      // Mirror the change into the parent so a later undo has a real "after"
      // to revert from — without this the parent's block.content stays at the
      // pre-edit value and undo becomes a no-op.
      onCommitContent(block.id, content);
      record({ kind: "edit-block-content", blockId: block.id, before, after: content });
    }
    editStartValue.current = content;
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
          onClick={() => onDelete(block)}
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
        onFocus={handleFocus}
        onBlur={handleBlur}
        className={cn("py-0.5", className)}
        placeholder={isHeading ? "Heading" : "Type something…"}
      />
      <button
        onClick={() => onDelete(block)}
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
  const record = useRecordAction();
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
    // Record the position at which the block is being appended so undo can
    // remove it and redo can splice it back to the same slot.
    const index = page.blocks.length;
    mutate((p) => ({ ...p, blocks: [...p.blocks, block] }));
    record({ kind: "create-block", block, index });
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

  function deleteBlock(block: Block) {
    // Capture the block's slot in the current list so undo can put it back in
    // the same visual position — the block's own `order` field also survives
    // via the snapshot below, but the visible index is what the reducer uses.
    const index = page.blocks.findIndex((b) => b.id === block.id);
    record({ kind: "delete-block", block, index });
    mutate((p) => ({ ...p, blocks: p.blocks.filter((b) => b.id !== block.id) }));
    api.deleteBlock(block.id).catch(() => resync());
  }

  const commitContent = useCallback(
    (id: string, content: string) => {
      mutate((p) => ({
        ...p,
        blocks: p.blocks.map((b) => (b.id === id ? { ...b, content } : b)),
      }));
    },
    [mutate]
  );

  return (
    <div>
      <div className="space-y-0.5">
        {page.blocks.map((block) => (
          <BlockRow
            key={block.id}
            block={block}
            onDelete={deleteBlock}
            onCommitContent={commitContent}
          />
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

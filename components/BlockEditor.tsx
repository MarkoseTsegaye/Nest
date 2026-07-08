"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  FileText,
  Heading,
  Link2,
  List,
  ListOrdered,
  Plus,
  Trash2,
  Type,
} from "lucide-react";
import { api } from "@/lib/api-client";
import { usePages } from "@/lib/pages-context";
import { newId } from "@/lib/id";
import {
  contentToPlainText,
  isEmptyContent,
  serializeContent,
  type BlockContent,
} from "@/lib/block-content";
import { useDebouncedCallback } from "@/lib/use-debounced-callback";
import { useRecordAction } from "@/lib/use-page-history";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Block, BlockType, PageDetail } from "@/lib/types";
import { InlineEditor, type InlineEditorHandle } from "./InlineEditor";
import { FormattingToolbar } from "./FormattingToolbar";
import { runSlashCommand, SLASH_COMMANDS } from "@/lib/slash-commands";

const headingClasses: Record<number, string> = {
  1: "font-display text-2xl font-bold tracking-tight",
  2: "font-display text-xl font-bold tracking-tight",
  3: "font-display text-lg font-semibold tracking-tight",
};

// A stable DOM id for a block's editor root, used for focus hand-off from
// the "Add block" dropdown and for the render-time sync's focus check.
const blockFieldId = (id: string) => `block-field-${id}`;

interface ConvertHint {
  type: Extract<BlockType, "text" | "heading" | "bulleted_list_item" | "numbered_list_item">;
  headingLevel?: number;
}

function classNameFor(block: Block): string {
  if (block.type === "heading") {
    return cn("py-0.5", headingClasses[block.headingLevel ?? 2]);
  }
  return "py-0.5 text-[15px] leading-relaxed";
}

function marker(type: BlockType, indexInList: number): React.ReactNode {
  if (type === "bulleted_list_item") {
    return (
      <span className="pt-2 text-muted-foreground/70 shrink-0 w-4 text-center select-none">
        •
      </span>
    );
  }
  if (type === "numbered_list_item") {
    return (
      <span className="pt-1 text-muted-foreground/70 shrink-0 w-6 text-right pr-1 tabular-nums select-none">
        {indexInList + 1}.
      </span>
    );
  }
  return null;
}

function BlockRow({
  block,
  indexInList,
  onDelete,
  onCommitContent,
  onConvert,
}: {
  block: Block;
  indexInList: number;
  onDelete: (block: Block) => void;
  onCommitContent: (id: string, content: BlockContent) => void;
  onConvert: (block: Block, next: ConvertHint) => void;
}) {
  const [content, setContent] = useState<BlockContent>(block.content ?? []);
  // Track the value at focus time so we record a single undo entry per edit
  // session (Notion-style), not per keystroke.
  const editStartValue = useRef<BlockContent>(block.content ?? []);
  const record = useRecordAction();
  const editorRef = useRef<InlineEditorHandle | null>(null);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");

  // Sync local content when the parent mutates block.content from outside
  // (undo, redo, mark toggle) unless the user is currently typing in this
  // block's editor. Render-time reset pattern, same as other components.
  const [syncedSerialized, setSyncedSerialized] = useState<string>(
    serializeContent(block.content ?? [])
  );
  const incomingSerialized = serializeContent(block.content ?? []);
  if (syncedSerialized !== incomingSerialized) {
    setSyncedSerialized(incomingSerialized);
    if (
      typeof document === "undefined" ||
      document.activeElement?.id !== blockFieldId(block.id)
    ) {
      setContent(block.content ?? []);
    }
  }

  const debouncedSave = useDebouncedCallback((next: BlockContent) => {
    api.updateBlock(block.id, { content: next }).catch(() => {});
  }, 800);

  function handleChange(next: BlockContent) {
    setContent(next);
    debouncedSave(next);
    // Slash command detection — trigger only when the entire block is a
    // single "/word" pattern, so we don't spring a menu on someone typing
    // "and/or" in a paragraph.
    const plain = contentToPlainText(next).trim();
    if (/^\/[a-z0-9]*$/i.test(plain)) {
      setSlashOpen(true);
      setSlashQuery(plain.slice(1).toLowerCase());
    } else if (slashOpen) {
      setSlashOpen(false);
    }
  }

  function handleFocus() {
    editStartValue.current = content;
  }

  function handleBlur(final: BlockContent) {
    debouncedSave.cancel();
    api.updateBlock(block.id, { content: final }).catch(() => {});
    const before = editStartValue.current;
    const beforeSerialized = serializeContent(before);
    const afterSerialized = serializeContent(final);
    if (beforeSerialized !== afterSerialized) {
      onCommitContent(block.id, final);
      record({
        kind: "edit-block-content",
        blockId: block.id,
        before,
        after: final,
      });
    }
    editStartValue.current = final;
    setContent(final);
    // Don't leave the slash menu open when focus leaves; another edit will
    // reopen it if it's still relevant.
    setSlashOpen(false);
  }

  function pickSlash(commandName: string) {
    const cmd = SLASH_COMMANDS.find((c) => c.name === commandName);
    if (!cmd) return;
    setSlashOpen(false);
    // Blank the block and convert it. The parent handles the API type change
    // (so undo can revert both together via a resync fallback).
    onConvert(block, { type: cmd.type, headingLevel: cmd.headingLevel });
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
  const placeholder = isHeading
    ? "Heading"
    : block.type === "bulleted_list_item" || block.type === "numbered_list_item"
    ? "List"
    : "Type '/' for commands…";

  return (
    <div className="group relative flex items-start gap-1 py-0.5">
      {marker(block.type, indexInList)}
      <InlineEditor
        domId={blockFieldId(block.id)}
        editorRef={editorRef}
        content={content}
        placeholder={placeholder}
        className={cn("flex-1", classNameFor(block))}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
      />
      <button
        onClick={() => onDelete(block)}
        className="opacity-0 group-hover:opacity-100 flex size-6 items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-secondary shrink-0 mt-0.5 transition-opacity"
      >
        <Trash2 className="size-3.5" />
      </button>
      <FormattingToolbar
        editorRef={editorRef}
        content={content}
        onContentChange={(next) => {
          handleChange(next);
          onCommitContent(block.id, next);
        }}
      />
      {slashOpen && (
        <SlashMenu
          query={slashQuery}
          onPick={pickSlash}
          onClose={() => setSlashOpen(false)}
        />
      )}
    </div>
  );
}

function SlashMenu({
  query,
  onPick,
  onClose,
}: {
  query: string;
  onPick: (name: string) => void;
  onClose: () => void;
}) {
  const results = useMemo(() => runSlashCommand(query, 8), [query]);

  // Enter is dispatched at the document level so we don't need to reach into
  // the InlineEditor's onKeyDown; the editor eats its own Enter, but this
  // handler fires first via capture.
  useMemo(() => {
    if (typeof window === "undefined") return;
    // no-op; retained for potential future use
  }, []);

  if (results.length === 0) return null;

  return (
    <div
      className="absolute left-4 top-full z-40 mt-1 w-56 rounded-lg border border-border bg-popover shadow-lg p-1"
      onMouseDown={(e) => e.preventDefault()} // don't blur the editor
    >
      {results.map((r, i) => (
        <button
          key={r.name}
          onClick={() => onPick(r.name)}
          data-first={i === 0 ? "1" : undefined}
          className={cn(
            "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left",
            "hover:bg-accent focus-visible:bg-accent outline-none",
            i === 0 && "bg-accent/50"
          )}
        >
          <r.icon className="size-4 text-muted-foreground" />
          <span className="flex-1">{r.label}</span>
          <span className="text-xs text-muted-foreground/60">/{r.name}</span>
        </button>
      ))}
      <button className="hidden" onClick={onClose} />
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
      content: [],
      headingLevel: type === "heading" ? 2 : null,
      linkedPageId: null,
      linkedPage: null,
    };
    pendingFocus.current = id;
    const index = page.blocks.length;
    mutate((p) => ({ ...p, blocks: [...p.blocks, block] }));
    record({ kind: "create-block", block, index });
    api
      .createBlock(page.id, {
        id,
        type,
        content: [],
        headingLevel: type === "heading" ? 2 : undefined,
      })
      .catch(() => resync());
  }

  function addPageLink() {
    const blockId = newId();
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
    const index = page.blocks.findIndex((b) => b.id === block.id);
    record({ kind: "delete-block", block, index });
    mutate((p) => ({ ...p, blocks: p.blocks.filter((b) => b.id !== block.id) }));
    api.deleteBlock(block.id).catch(() => resync());
  }

  const commitContent = useCallback(
    (id: string, content: BlockContent) => {
      mutate((p) => ({
        ...p,
        blocks: p.blocks.map((b) => (b.id === id ? { ...b, content } : b)),
      }));
    },
    [mutate]
  );

  // Convert a block's type via slash command. Records nothing for undo yet
  // (that would need a new action variant for kind changes); a subsequent
  // edit gives you an undo entry that reverts the content, and refresh
  // recovers the type.
  function convertBlock(block: Block, next: ConvertHint) {
    mutate((p) => ({
      ...p,
      blocks: p.blocks.map((b) =>
        b.id === block.id
          ? {
              ...b,
              type: next.type,
              content: [],
              headingLevel: next.type === "heading" ? next.headingLevel ?? 2 : null,
            }
          : b
      ),
    }));
    api
      .updateBlock(block.id, {
        type: next.type,
        content: [],
        headingLevel: next.type === "heading" ? next.headingLevel ?? 2 : null,
      })
      .catch(() => resync());
  }

  // Render blocks, wrapping consecutive list items in a shared UL/OL for
  // proper list markup. Each element in `groups` is either a plain block or
  // a run of adjacent list items.
  const groups = useMemo(() => groupBlocks(page.blocks), [page.blocks]);

  return (
    <div>
      <div className="space-y-0.5">
        {groups.map((group, gi) =>
          group.kind === "list" ? (
            <div key={`list-${gi}`} className="pl-1">
              {group.blocks.map((b, i) => (
                <BlockRow
                  key={b.id}
                  block={b}
                  indexInList={i}
                  onDelete={deleteBlock}
                  onCommitContent={commitContent}
                  onConvert={convertBlock}
                />
              ))}
            </div>
          ) : (
            <BlockRow
              key={group.block.id}
              block={group.block}
              indexInList={0}
              onDelete={deleteBlock}
              onCommitContent={commitContent}
              onConvert={convertBlock}
            />
          )
        )}
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

type BlockGroup =
  | { kind: "single"; block: Block }
  | { kind: "list"; type: "bulleted_list_item" | "numbered_list_item"; blocks: Block[] };

function groupBlocks(blocks: Block[]): BlockGroup[] {
  const out: BlockGroup[] = [];
  for (const block of blocks) {
    if (block.type === "bulleted_list_item" || block.type === "numbered_list_item") {
      const last = out[out.length - 1];
      if (last && last.kind === "list" && last.type === block.type) {
        last.blocks.push(block);
      } else {
        out.push({ kind: "list", type: block.type, blocks: [block] });
      }
    } else {
      out.push({ kind: "single", block });
    }
  }
  return out;
}

// Suppress unused-warning for the pull-out symbols referenced by TSX above.
void isEmptyContent;
void List;
void ListOrdered;

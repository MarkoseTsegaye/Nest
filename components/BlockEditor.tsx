"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { FileText, Link2, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api-client";
import { usePages } from "@/lib/pages-context";
import { newId } from "@/lib/id";
import {
  contentToPlainText,
  isEmptyContent,
  normalizeContent,
  serializeContent,
  type BlockContent,
} from "@/lib/block-content";
import { saveSelection } from "@/lib/span-dom";
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
import { runSlashCommand, type SlashCommand } from "@/lib/slash-commands";
import { matchBlockMarkdown } from "@/lib/markdown-input";

const headingClasses: Record<number, string> = {
  1: "font-display text-2xl font-bold tracking-tight",
  2: "font-display text-xl font-bold tracking-tight",
  3: "font-display text-lg font-semibold tracking-tight",
};

// Stable DOM id for a block's editor root — used for focus handoff after
// creating a block via the gutter menu or an Enter key.
const blockFieldId = (id: string) => `block-field-${id}`;

interface ConvertHint {
  type: Extract<BlockType, "text" | "heading" | "bulleted_list_item" | "numbered_list_item">;
  headingLevel?: number;
  // When true, keep the existing block content (Backspace-revert of a heading
  // or list back to plain text). When false/undefined, blank the content — the
  // slash-command path, where "/h1" text needs to be wiped.
  preserveContent?: boolean;
  // Explicit replacement content. Used by markdown block shortcuts, which strip
  // the "# " / "- " marker and keep whatever the user typed after it. Takes
  // precedence over preserveContent.
  content?: BlockContent;
}

function classNameFor(block: Block): string {
  if (block.type === "heading") {
    return cn("py-0.5", headingClasses[block.headingLevel ?? 2]);
  }
  return "py-0.5 text-[15px] leading-relaxed";
}

/*
 * List markers. Both bullet and number sit in the same fixed-width gutter so a
 * list's text left-edge stays put regardless of marker. The glyph is vertically
 * centered on the block's first text line (a line-box-height flex wrapper at the
 * editor's 15px/leading-relaxed metrics, offset by the editor's py-0.5 top) so
 * markers line up with the text instead of floating a hair high or low.
 */
function marker(type: BlockType, indexInList: number): React.ReactNode {
  if (type !== "bulleted_list_item" && type !== "numbered_list_item") return null;
  return (
    <span className="shrink-0 select-none w-7 pr-2 pt-0.5 text-[15px] flex justify-end">
      <span className="flex h-[1.625em] items-center">
        {type === "bulleted_list_item" ? (
          <span className="block size-[5px] rounded-full bg-muted-foreground/70" />
        ) : (
          <span className="text-[13px] font-medium tabular-nums leading-none text-muted-foreground/60">
            {indexInList + 1}.
          </span>
        )}
      </span>
    </span>
  );
}

/** True when a markdown block match resolves to the block's current type (and
 *  heading level) — used to leave "## " inside an H2 (or "- " inside a bullet)
 *  as literal text rather than re-converting to the same thing. */
function isSameBlockShape(
  match: { type: BlockType; headingLevel?: number },
  block: Block
): boolean {
  if (match.type !== block.type) return false;
  if (match.type === "heading") {
    return (match.headingLevel ?? 2) === (block.headingLevel ?? 2);
  }
  return true;
}

/** Slice a BlockContent by text offsets [from, to), preserving each run's marks. */
function sliceContent(content: BlockContent, from: number, to: number): BlockContent {
  const out: BlockContent = [];
  let acc = 0;
  for (const span of content) {
    const s = acc;
    const e = acc + span.text.length;
    const a = Math.max(from, s);
    const b = Math.min(to, e);
    if (a < b) out.push({ ...span, text: span.text.slice(a - s, b - s) });
    acc = e;
  }
  return normalizeContent(out);
}

/*
 * A line-level markdown conversion. The user typed a block marker at the start
 * of one line inside a (possibly multi-line) block. We split that block around
 * the line so the marked line becomes its own block of `target` type — the
 * Notion move that lets you start a heading or list on any line, not just at the
 * top of a block.
 */
interface BlockMarkdownSplit {
  /** Content on the lines before the marked line (stays as the original block). */
  before: BlockContent;
  target: Extract<
    BlockType,
    "text" | "heading" | "bulleted_list_item" | "numbered_list_item"
  >;
  headingLevel?: number;
  /** The marked line minus its marker (becomes the new `target` block). */
  lineContent: BlockContent;
  /** Content on the lines after the marked line (becomes a trailing text block). */
  after: BlockContent;
}

function BlockRow({
  block,
  indexInList,
  onDelete,
  onCommitContent,
  onConvert,
  onAddPageLinkAfter,
  onBackspaceEmptyText,
  onInsertTextAfter,
  onInsertListItemAfter,
  onBlockMarkdown,
}: {
  block: Block;
  indexInList: number;
  onDelete: (block: Block) => void;
  onCommitContent: (id: string, content: BlockContent) => void;
  onConvert: (block: Block, next: ConvertHint) => void;
  onAddPageLinkAfter: (afterBlock: Block) => void;
  onBackspaceEmptyText: (block: Block) => void;
  onInsertTextAfter: (afterBlock: Block) => void;
  onInsertListItemAfter: (
    afterBlock: Block,
    type: "bulleted_list_item" | "numbered_list_item"
  ) => void;
  onBlockMarkdown: (block: Block, split: BlockMarkdownSplit) => void;
}) {
  const [content, setContent] = useState<BlockContent>(block.content ?? []);
  // Track the value at focus time so we record a single undo entry per edit
  // session (Notion-style), not per keystroke.
  const editStartValue = useRef<BlockContent>(block.content ?? []);
  const record = useRecordAction();
  const editorRef = useRef<InlineEditorHandle | null>(null);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [slashIndex, setSlashIndex] = useState(0);
  const slashResults = useMemo(
    () => (slashOpen ? runSlashCommand(slashQuery, 8) : []),
    [slashOpen, slashQuery]
  );
  // Reset the highlight to the top result whenever the query changes (Notion
  // re-ranks on each keystroke, so the best match should be pre-selected). Done
  // as a render-time reset rather than an effect to avoid a cascading render.
  const [slashResetKey, setSlashResetKey] = useState(slashQuery);
  if (slashResetKey !== slashQuery) {
    setSlashResetKey(slashQuery);
    setSlashIndex(0);
  }

  // Sync local content when the parent mutates block.content from outside
  // (undo, redo, mark toggle) unless the user is currently typing here.
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

    const plain = contentToPlainText(next);

    // Block-level markdown: "# ", "## ", "- ", "1. " etc. at the start of the
    // *current line* converts that line into its own block of the target type.
    // Because Enter inserts a soft newline (one block can hold many lines), this
    // is line-aware, not block-aware — so you can start a heading or list on any
    // line anywhere in the doc, not only at the very top of a block. Skipped
    // only when the marker maps to the block's current shape at the very start
    // (typing "## " inside an existing H2, or "- " in a bullet, stays literal).
    // Only a collapsed caret (i.e. active typing) can trigger conversion — this
    // keeps toolbar mark-toggles and other range-selection edits from tripping
    // it.
    const root = editorRef.current?.getRoot();
    const sel = root ? saveSelection(root) : null;
    if (block.type !== "page_link" && sel && sel.start === sel.end) {
      const caret = sel.start;
      const lineStart = plain.lastIndexOf("\n", Math.max(0, caret - 1)) + 1;
      const nl = plain.indexOf("\n", caret);
      const lineEnd = nl === -1 ? plain.length : nl;
      const line = plain.slice(lineStart, lineEnd);
      const bm = matchBlockMarkdown(line);
      const wholeBlockIsLine = lineStart === 0 && lineEnd === plain.length;
      if (bm && !(wholeBlockIsLine && isSameBlockShape(bm, block))) {
        debouncedSave.cancel();
        setSlashOpen(false);
        const markerLen = line.length - bm.rest.length; // marker + trailing space
        // `before` excludes the newline that separates it from the marked line.
        const before = lineStart > 0 ? sliceContent(next, 0, lineStart - 1) : [];
        const lineContent = sliceContent(next, lineStart + markerLen, lineEnd);
        // `after` skips the newline that follows the marked line.
        const after =
          lineEnd < plain.length ? sliceContent(next, lineEnd + 1, plain.length) : [];
        // Update THIS row's local content to match what it becomes: the marked
        // line's content when it converts in place (no head), else the head.
        const localNext = isEmptyContent(before) ? lineContent : before;
        setContent(localNext);
        editStartValue.current = localNext;
        onBlockMarkdown(block, {
          before,
          target: bm.type,
          headingLevel: bm.headingLevel,
          lineContent,
          after,
        });
        return;
      }
    }

    // Slash detection: open menu when the whole block reads "/word" so
    // typing "and/or" in prose doesn't spring the menu.
    const trimmed = plain.trim();
    if (/^\/[a-z0-9]*$/i.test(trimmed)) {
      setSlashOpen(true);
      setSlashQuery(trimmed.slice(1).toLowerCase());
    } else if (slashOpen) {
      setSlashOpen(false);
    }
    // Text is the ground state. Any time a formatted block ends up empty (e.g.
    // ctrl-A + Backspace on a heading) revert it to text so the user isn't
    // left staring at an empty "Heading" placeholder they can't type past.
    // Idempotent once type has flipped to text.
    if (isEmptyContent(next) && block.type !== "text") {
      onConvert(block, { type: "text" });
    }
  }

  function handleFocus() {
    editStartValue.current = content;
  }

  function handleBlur(final: BlockContent) {
    debouncedSave.cancel();
    api.updateBlock(block.id, { content: final }).catch(() => {});
    const before = editStartValue.current;
    if (serializeContent(before) !== serializeContent(final)) {
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
    setSlashOpen(false);
  }

  function pickSlash(cmd: SlashCommand) {
    setSlashOpen(false);
    // Reset LOCAL editor state to empty so the "/h1" text disappears — without
    // this, the parent's mutate-to-empty is blocked by our render-time focus
    // guard (the editor is focused when the user clicks the menu).
    setContent([]);
    editStartValue.current = [];
    onConvert(block, { type: cmd.type, headingLevel: cmd.headingLevel });
    // Refocus after conversion so the user can immediately type. We look the
    // element up by id instead of using editorRef because a single↔list group
    // switch can remount InlineEditor and invalidate the ref between now and
    // the rAF firing; the DOM id is stable across that remount.
    requestAnimationFrame(() => {
      document.getElementById(blockFieldId(block.id))?.focus();
    });
  }

  // Return true to consume the Enter (parent handled it). Return false to let
  // the editor drop a soft <br> inside this block — the plain-text default.
  //
  // Slash-menu pick wins first. Then the format-exit branches:
  //   - heading  → new empty text block below (formats don't spill onto the
  //                next line; text is the ground state).
  //   - list     → non-empty: new list item of same type; empty item: convert
  //                this block to text (Notion-style list exit).
  //   - text     → return false, soft <br>.
  function handleEnter(): boolean {
    if (slashOpen) {
      const cmd = slashResults[slashIndex] ?? slashResults[0];
      if (cmd) {
        pickSlash(cmd);
        return true;
      }
    }
    if (block.type === "heading") {
      onInsertTextAfter(block);
      return true;
    }
    if (block.type === "bulleted_list_item" || block.type === "numbered_list_item") {
      if (contentToPlainText(content).trim().length === 0) {
        onConvert(block, { type: "text" });
        requestAnimationFrame(() => {
          document.getElementById(blockFieldId(block.id))?.focus();
        });
        return true;
      }
      onInsertListItemAfter(block, block.type);
      return true;
    }
    return false;
  }

  // Slash-menu keyboard navigation. Returns true when the key was consumed so
  // the editor suppresses its default (caret move / viewport scroll).
  function handleKeyNav(
    key: "ArrowUp" | "ArrowDown" | "Escape" | "Tab"
  ): boolean {
    if (!slashOpen || slashResults.length === 0) return false;
    if (key === "Escape") {
      setSlashOpen(false);
      return true;
    }
    if (key === "ArrowDown") {
      setSlashIndex((i) => (i + 1) % slashResults.length);
      return true;
    }
    if (key === "ArrowUp") {
      setSlashIndex((i) => (i - 1 + slashResults.length) % slashResults.length);
      return true;
    }
    if (key === "Tab") {
      const cmd = slashResults[slashIndex] ?? slashResults[0];
      if (cmd) pickSlash(cmd);
      return true;
    }
    return false;
  }

  function handleBackspaceAtStart() {
    if (
      block.type === "heading" ||
      block.type === "bulleted_list_item" ||
      block.type === "numbered_list_item"
    ) {
      onConvert(block, { type: "text", preserveContent: true });
      requestAnimationFrame(() => {
        document.getElementById(blockFieldId(block.id))?.focus();
      });
      return;
    }
    if (block.type === "text" && contentToPlainText(content).length === 0) {
      onBackspaceEmptyText(block);
    }
  }

  if (block.type === "page_link") {
    return (
      <div className="group flex items-center gap-1 py-0.5 relative">
        <GutterAdd onAdd={() => onAddPageLinkAfter(block)} />
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
    <div className="group relative flex items-start py-0.5">
      <GutterAdd onAdd={() => onAddPageLinkAfter(block)} />
      {marker(block.type, indexInList)}
      <InlineEditor
        domId={blockFieldId(block.id)}
        editorRef={editorRef}
        content={content}
        placeholder={placeholder}
        className={cn("flex-1 min-w-0", classNameFor(block))}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onEnter={handleEnter}
        onBackspaceAtStart={handleBackspaceAtStart}
        onKeyNav={handleKeyNav}
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
      {slashOpen && slashResults.length > 0 && (
        <SlashMenu
          results={slashResults}
          activeIndex={slashIndex}
          onHoverIndex={setSlashIndex}
          onPick={pickSlash}
        />
      )}
    </div>
  );
}

// Gutter "+" button: only offers Page link. Text / heading / lists are all
// added through the slash menu inside the block itself — keeping this menu
// tiny makes the block boundary feel like a solid unit, not a launcher.
function GutterAdd({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="absolute -left-8 top-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title="Add page link below"
            className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
            // Don't blur the currently-focused editor when opening.
            onMouseDown={(e) => e.preventDefault()}
          >
            <Plus className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={onAdd}>
            <Link2 />
            Page link
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function SlashMenu({
  results,
  activeIndex,
  onHoverIndex,
  onPick,
}: {
  results: SlashCommand[];
  activeIndex: number;
  onHoverIndex: (i: number) => void;
  onPick: (cmd: SlashCommand) => void;
}) {
  return (
    <div
      // Keep clicks from blurring the editor — otherwise the blur handler
      // would fire before our onClick, closing the menu.
      onMouseDown={(e) => e.preventDefault()}
      className="absolute left-4 top-full z-40 mt-1 w-56 rounded-lg border border-border bg-popover shadow-lg p-1"
    >
      {results.map((r, i) => (
        <button
          key={r.name}
          type="button"
          onClick={() => onPick(r)}
          onMouseEnter={() => onHoverIndex(i)}
          className={cn(
            "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left",
            "outline-none transition-colors",
            i === activeIndex ? "bg-accent text-foreground" : "text-foreground/90"
          )}
        >
          <r.icon className="size-4 text-muted-foreground" />
          <span className="flex-1">{r.label}</span>
          <span className="text-xs text-muted-foreground/60">/{r.name}</span>
        </button>
      ))}
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

  function focusPending() {
    const id = pendingFocus.current;
    pendingFocus.current = null;
    if (id) {
      requestAnimationFrame(() => {
        document.getElementById(blockFieldId(id))?.focus();
      });
    }
  }

  // Insert a fresh empty text / bulleted / numbered block at `index`, focus
  // it, and mirror the write to the server. Used by Enter on heading (spawns
  // a plain-text row) and Enter on a non-empty list item (continues the list),
  // plus the "always at least one block" guard.
  function insertBlockAt(
    index: number,
    type: "text" | "bulleted_list_item" | "numbered_list_item"
  ) {
    const id = newId();
    const block: Block = {
      id,
      pageId: page.id,
      type,
      order: index,
      content: [],
      headingLevel: null,
      linkedPageId: null,
      linkedPage: null,
    };
    pendingFocus.current = id;
    mutate((p) => {
      const blocks = p.blocks.slice();
      blocks.splice(index, 0, block);
      return { ...p, blocks };
    });
    record({ kind: "create-block", block, index });
    api
      .createBlock(page.id, { id, type, content: [] })
      .catch(() => resync());
    focusPending();
  }

  // Insert a block with explicit type / content / heading level at `index`.
  // Optionally take focus. Returns the new block's id.
  function insertBlockWith(
    index: number,
    type: Exclude<BlockType, "page_link">,
    content: BlockContent,
    headingLevel: number | null,
    focus: boolean
  ): string {
    const id = newId();
    const block: Block = {
      id,
      pageId: page.id,
      type,
      order: index,
      content,
      headingLevel,
      linkedPageId: null,
      linkedPage: null,
    };
    if (focus) pendingFocus.current = id;
    mutate((p) => {
      const blocks = p.blocks.slice();
      blocks.splice(index, 0, block);
      return { ...p, blocks };
    });
    record({ kind: "create-block", block, index });
    api
      .createBlock(page.id, {
        id,
        type,
        content,
        headingLevel: headingLevel ?? undefined,
      })
      .catch(() => resync());
    if (focus) focusPending();
    return id;
  }

  // Apply a line-level markdown conversion: split the block around the marked
  // line so that line becomes its own block of the target type. Handles the
  // common "empty line at the end" case (plain in-place convert) up through a
  // marker on a middle line (keep the head, spin out the marked line, and drop
  // the tail into a trailing text block).
  function applyBlockMarkdown(block: Block, split: BlockMarkdownSplit) {
    const index = page.blocks.findIndex((b) => b.id === block.id);
    const beforeEmpty = isEmptyContent(split.before);
    const afterEmpty = isEmptyContent(split.after);

    if (beforeEmpty) {
      // The marked line is the block's first line — convert this block in place.
      convertBlock(block, {
        type: split.target,
        headingLevel: split.headingLevel,
        content: split.lineContent,
      });
      if (!afterEmpty) {
        insertBlockWith(index + 1, "text", split.after, null, false);
      }
      requestAnimationFrame(() => {
        document.getElementById(blockFieldId(block.id))?.focus();
      });
      return;
    }

    // Marker sits below other text: keep the head as the original block, spin
    // the marked line out into a new target block (focused), then any tail.
    commitContent(block.id, split.before);
    api.updateBlock(block.id, { content: split.before }).catch(() => resync());
    insertBlockWith(
      index + 1,
      split.target,
      split.lineContent,
      split.target === "heading" ? split.headingLevel ?? 2 : null,
      true
    );
    if (!afterEmpty) {
      insertBlockWith(index + 2, "text", split.after, null, false);
    }
  }

  function insertTextAfter(afterBlock: Block) {
    const at = page.blocks.findIndex((b) => b.id === afterBlock.id) + 1;
    insertBlockAt(at, "text");
  }

  function insertListItemAfter(
    afterBlock: Block,
    type: "bulleted_list_item" | "numbered_list_item"
  ) {
    const at = page.blocks.findIndex((b) => b.id === afterBlock.id) + 1;
    insertBlockAt(at, type);
  }

  function addPageLinkAfter(afterBlock: Block) {
    const afterIndex = page.blocks.findIndex((b) => b.id === afterBlock.id) + 1;
    const id = newId();
    const child = createPage({ parentId: page.id, title: "Untitled", persist: false });
    const block: Block = {
      id,
      pageId: page.id,
      type: "page_link",
      order: afterIndex,
      content: null,
      headingLevel: null,
      linkedPageId: child.id,
      linkedPage: { id: child.id, title: child.title },
    };
    mutate((p) => {
      const blocks = p.blocks.slice();
      blocks.splice(afterIndex, 0, block);
      return { ...p, blocks };
    });
    record({ kind: "create-block", block, index: afterIndex });
    api
      .createBlock(page.id, { id, type: "page_link", linkedPageId: child.id })
      .catch(() => resync());
  }

  function deleteBlock(block: Block) {
    const index = page.blocks.findIndex((b) => b.id === block.id);
    const wasLast = page.blocks.length === 1;
    record({ kind: "delete-block", block, index });
    mutate((p) => ({ ...p, blocks: p.blocks.filter((b) => b.id !== block.id) }));
    api.deleteBlock(block.id).catch(() => resync());
    // A page must always have somewhere to type — if this was the last block,
    // spawn a fresh empty text row in its place.
    if (wasLast) insertBlockAt(0, "text");
  }

  // Backspace at the start of an empty text block: delete it and move focus
  // to the previous block. If there IS no previous block we leave the block
  // alone — the page always needs at least one editable target.
  function backspaceEmptyText(block: Block) {
    const index = page.blocks.findIndex((b) => b.id === block.id);
    if (index <= 0) return;
    const prev = page.blocks[index - 1];
    deleteBlock(block);
    if (prev.type !== "page_link") {
      pendingFocus.current = prev.id;
      focusPending();
    }
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

  function convertBlock(block: Block, next: ConvertHint) {
    const headingLevel = next.type === "heading" ? next.headingLevel ?? 2 : null;
    const explicit = next.content !== undefined;
    mutate((p) => ({
      ...p,
      blocks: p.blocks.map((b) => {
        if (b.id !== block.id) return b;
        const content = explicit ? next.content! : next.preserveContent ? b.content : [];
        return { ...b, type: next.type, content, headingLevel };
      }),
    }));
    const apiContent = explicit
      ? next.content!
      : next.preserveContent
      ? undefined
      : [];
    api
      .updateBlock(block.id, {
        type: next.type,
        ...(apiContent !== undefined ? { content: apiContent } : {}),
        headingLevel,
      })
      .catch(() => resync());
  }

  const groups = useMemo(() => groupBlocks(page.blocks), [page.blocks]);

  const rowProps = {
    onDelete: deleteBlock,
    onCommitContent: commitContent,
    onConvert: convertBlock,
    onAddPageLinkAfter: addPageLinkAfter,
    onBackspaceEmptyText: backspaceEmptyText,
    onInsertTextAfter: insertTextAfter,
    onInsertListItemAfter: insertListItemAfter,
    onBlockMarkdown: applyBlockMarkdown,
  };

  return (
    <div className="pl-8">
      <div className="space-y-0.5">
        {groups.map((group) => {
          // Every group renders inside the same wrapper shape — a keyed <div>
          // whose className varies. That way a text→list conversion doesn't
          // change the React tree at this position, BlockRow stays mounted,
          // and its InlineEditor keeps its editorRef / focus / selection.
          const blocks = group.kind === "list" ? group.blocks : [group.block];
          return (
            <div
              key={`group-${blocks[0].id}`}
              className={group.kind === "list" ? "pl-1" : undefined}
            >
              {blocks.map((b, i) => (
                <BlockRow key={b.id} block={b} indexInList={i} {...rowProps} />
              ))}
            </div>
          );
        })}
      </div>
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

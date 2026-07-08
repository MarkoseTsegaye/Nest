"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  readSpansFromDom,
  renderSpansToDom,
  restoreSelection,
  saveSelection,
} from "@/lib/span-dom";
import {
  isEmptyContent,
  serializeContent,
  type BlockContent,
} from "@/lib/block-content";
import { cn } from "@/lib/utils";

/*
 * Controlled contentEditable for one block. The React tree does NOT own the
 * inner DOM — the ref does. That's the only way to make contentEditable
 * cooperate with React without wrestling every keystroke:
 *
 *   - Mount: we imperatively paint `content` into the div once.
 *   - Typing: contentEditable manages the DOM natively; onInput reads the DOM
 *     back into a Span[] and hands it to onChange. React never touches the
 *     editor's children during typing.
 *   - External updates (undo, toolbar toggling a mark): we notice via the
 *     `content` prop, save the selection, repaint the DOM, restore the
 *     selection. Idempotent — a serialized-equality guard skips repaint when
 *     the content matches what we last emitted / painted.
 */
export interface InlineEditorHandle {
  focus: () => void;
  getRoot: () => HTMLDivElement | null;
}

export function InlineEditor({
  content,
  placeholder,
  className,
  onChange,
  onFocus,
  onBlur,
  onEnter,
  editorRef,
  ariaLabel,
  domId,
}: {
  content: BlockContent;
  placeholder?: string;
  className?: string;
  onChange: (next: BlockContent) => void;
  onFocus?: () => void;
  onBlur?: (final: BlockContent) => void;
  /** Called on Enter without shift — the parent decides what to do (add a new
   *  block, exit a list, etc). Return true to prevent default. */
  /** Fired on unmodified Enter — the parent decides what to do (create a
   *  new block, pick a slash command). Enter is always preventDefault'd so
   *  contentEditable can't sneak in a `<br>` or a `<div>` split. */
  onEnter?: () => void;
  editorRef?: React.RefObject<InlineEditorHandle | null>;
  ariaLabel?: string;
  domId?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  // The serialized content we last painted OR read from the DOM. Used to skip
  // redundant DOM repaints and to distinguish external-source updates from
  // our own emit-echo when React re-renders.
  const paintedRef = useRef<string>("");

  // Expose focus + root access to parents (toolbar, block editor).
  useEffect(() => {
    if (!editorRef) return;
    editorRef.current = {
      focus: () => rootRef.current?.focus(),
      getRoot: () => rootRef.current,
    };
  }, [editorRef]);

  // Initial paint — done once on mount. We use a layout effect so the DOM is
  // painted before the user could possibly see the (empty) initial render.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    renderSpansToDom(el, content);
    paintedRef.current = serializeContent(content);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // External-source sync. If the content prop changes to something other than
  // what we last emitted (undo, mark toggle from the toolbar), repaint DOM
  // and preserve any active selection so the user's caret stays put.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const next = serializeContent(content);
    if (next === paintedRef.current) return;
    const saved = document.activeElement === el ? saveSelection(el) : null;
    renderSpansToDom(el, content);
    paintedRef.current = next;
    if (saved) restoreSelection(el, saved);
  }, [content]);

  const handleInput = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    const spans = readSpansFromDom(el);
    paintedRef.current = serializeContent(spans);
    onChange(spans);
  }, [onChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        // contentEditable would otherwise insert a <br> or a new <div>. Let
        // the parent decide what happens (create a new block, pick slash).
        e.preventDefault();
        onEnter?.();
      }
    },
    [onEnter]
  );

  // Pasting rich HTML into a contentEditable would inject foreign markup —
  // strip to plain text so the on-disk content stays inside the Span shape.
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    if (!text) return;
    document.execCommand("insertText", false, text);
  }, []);

  return (
    <div
      ref={rootRef}
      id={domId}
      role="textbox"
      aria-label={ariaLabel}
      aria-multiline="false"
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      data-empty={isEmptyContent(content) ? "1" : undefined}
      onInput={handleInput}
      onFocus={onFocus}
      onBlur={() => {
        const el = rootRef.current;
        if (!el) return onBlur?.(content);
        onBlur?.(readSpansFromDom(el));
      }}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      className={cn(
        "outline-none whitespace-pre-wrap break-words",
        // Placeholder rendering via a CSS ::before that shows when empty.
        "data-[empty=1]:before:content-[attr(data-placeholder)] data-[empty=1]:before:text-muted-foreground/40 data-[empty=1]:before:pointer-events-none",
        className
      )}
    />
  );
}

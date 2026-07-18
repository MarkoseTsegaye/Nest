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
import { applyInlineMarkdown, stripMarksInRange } from "@/lib/markdown-input";
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
  persistentPlaceholder = false,
  className,
  onChange,
  onFocus,
  onBlur,
  onEnter,
  onBackspaceAtStart,
  onKeyNav,
  editorRef,
  ariaLabel,
  domId,
}: {
  content: BlockContent;
  placeholder?: string;
  /** Show the placeholder even when the editor is not focused. Default is
   *  Notion-style: an unfocused empty line renders clean, and the hint only
   *  appears under the caret. Persistent is for empty headings ("Heading 1")
   *  and the sole block of an empty page. */
  persistentPlaceholder?: boolean;
  className?: string;
  onChange: (next: BlockContent) => void;
  onFocus?: () => void;
  onBlur?: (final: BlockContent) => void;
  /** Called on unmodified Enter. Return true to consume the event (e.g. a
   *  slash-menu pick took precedence); otherwise the editor inserts a soft
   *  line break (`<br>`) inside the current block. Enter is always
   *  preventDefault'd so contentEditable can't sneak in its own split. */
  onEnter?: () => boolean | void;
  /** Called when Backspace is pressed with a collapsed selection at text
   *  offset 0. The editor prevents the default so the parent can decide what
   *  to do (revert a heading to text, delete an empty block, etc). */
  onBackspaceAtStart?: () => void;
  /** Called for navigation keys while an overlay (e.g. the slash menu) is open.
   *  Return true to consume the key — the editor then prevents its default so
   *  the caret doesn't move and the browser doesn't scroll. */
  onKeyNav?: (key: "ArrowUp" | "ArrowDown" | "Escape" | "Tab") => boolean;
  editorRef?: React.RefObject<InlineEditorHandle | null>;
  ariaLabel?: string;
  domId?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  // The serialized content we last painted OR read from the DOM. Used to skip
  // redundant DOM repaints and to distinguish external-source updates from
  // our own emit-echo when React re-renders.
  const paintedRef = useRef<string>("");
  // After an inline-markdown transform we drop the caret right after the newly
  // styled run. contentEditable would then extend that run as the user keeps
  // typing — but markdown formatting should end at the closing delimiter. We
  // record the caret offset here and, on the very next input, strip marks off
  // whatever was inserted so typing continues in plain text (Notion behavior).
  const exitMarkAtRef = useRef<number | null>(null);

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
    const sel = saveSelection(el);

    // Exit-mark: the character(s) just typed right after a markdown transform
    // inherited the styled run's marks — strip them so formatting stops at the
    // closing delimiter. Only fires when the insertion is contiguous with the
    // recorded caret; anything else clears the pending state harmlessly.
    const exitAt = exitMarkAtRef.current;
    exitMarkAtRef.current = null;
    if (exitAt != null && sel && sel.start === sel.end && sel.start > exitAt) {
      const stripped = stripMarksInRange(spans, exitAt, sel.start);
      renderSpansToDom(el, stripped);
      paintedRef.current = serializeContent(stripped);
      restoreSelection(el, { start: sel.start, end: sel.start });
      onChange(stripped);
      return;
    }

    // Inline markdown: if the just-typed character completed a **bold** /
    // *italic* / `code` / ~~strike~~ run, rewrite it in place, strip the
    // delimiters, and drop the caret where the closing delimiter used to be.
    if (sel && sel.start === sel.end) {
      const md = applyInlineMarkdown(spans, sel.start);
      if (md) {
        renderSpansToDom(el, md.content);
        paintedRef.current = serializeContent(md.content);
        restoreSelection(el, { start: md.caret, end: md.caret });
        exitMarkAtRef.current = md.caret;
        onChange(md.content);
        return;
      }
    }
    paintedRef.current = serializeContent(spans);
    onChange(spans);
  }, [onChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      // Overlay navigation (slash menu) gets first crack at arrows / Escape / Tab.
      if (
        onKeyNav &&
        (e.key === "ArrowUp" ||
          e.key === "ArrowDown" ||
          e.key === "Escape" ||
          e.key === "Tab")
      ) {
        if (onKeyNav(e.key)) {
          e.preventDefault();
          return;
        }
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        // Give the parent first crack — a slash-menu pick may consume the key.
        if (onEnter?.()) return;
        // Otherwise: soft line break inside this block.
        document.execCommand("insertLineBreak");
        return;
      }
      if (
        e.key === "Backspace" &&
        !e.shiftKey &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        onBackspaceAtStart
      ) {
        const el = rootRef.current;
        if (!el) return;
        const saved = saveSelection(el);
        if (saved && saved.start === 0 && saved.end === 0) {
          e.preventDefault();
          onBackspaceAtStart();
        }
      }
    },
    [onEnter, onBackspaceAtStart, onKeyNav]
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
        // Placeholder via CSS ::before. Focus-gated by default (Notion-style:
        // the hint follows the caret); persistent mode shows it whenever empty.
        "data-[empty=1]:focus:before:content-[attr(data-placeholder)] data-[empty=1]:before:text-muted-foreground/40 data-[empty=1]:before:pointer-events-none",
        persistentPlaceholder &&
          "data-[empty=1]:before:content-[attr(data-placeholder)]",
        className
      )}
    />
  );
}

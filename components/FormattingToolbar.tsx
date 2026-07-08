"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Bold,
  Code,
  Italic,
  Palette,
  Strikethrough,
  Type as TypeIcon,
  Underline,
} from "lucide-react";
import {
  BOOLEAN_MARKS,
  COLORS,
  type BlockContent,
  type BooleanMark,
  type Color,
  type Size,
  type Span,
} from "@/lib/block-content";
import {
  rangeHasMark,
  saveSelection,
  updateMarksInRange,
} from "@/lib/span-dom";
import { cn } from "@/lib/utils";
import { type InlineEditorHandle } from "./InlineEditor";

/*
 * Selection toolbar.
 *
 * Visibility model (rewritten from the initial version, which was too eager):
 *
 *   • Only shows on **mouseup** (drag-select finished) or **keyup** (shift-arrow
 *     selection finished). No flicker during the drag.
 *   • Hides on **mousedown** anywhere outside the toolbar — user is about to
 *     click somewhere else.
 *   • Hides when the selection collapses (typing after a selection).
 *
 * Interaction:
 *
 *   • The toolbar and every button carry data-toolbar="1" so we can identify
 *     mousedowns inside it and skip the auto-hide.
 *   • Every button calls preventDefault on its own mousedown so focus stays
 *     on the contentEditable — otherwise mark-apply would run against a
 *     selection that no longer exists.
 *   • Marks apply to the offsets frozen at the moment the toolbar became
 *     visible. Reapplying (a second click) uses the same frozen offsets, so
 *     even a brief DOM repaint between clicks can't misalign the range.
 */

const BOOLEAN_ICON: Record<BooleanMark, React.ComponentType<{ className?: string }>> = {
  bold: Bold,
  italic: Italic,
  underline: Underline,
  strike: Strikethrough,
  code: Code,
};

const COLOR_SWATCH: Record<Color, string> = {
  gray: "#9ca3af",
  red: "#f87171",
  orange: "#fb923c",
  yellow: "#fbbf24",
  green: "#34d399",
  blue: "#60a5fa",
  purple: "#c084fc",
};

interface ToolbarState {
  rect: { top: number; left: number };
  from: number;
  to: number;
}

export function FormattingToolbar({
  editorRef,
  content,
  onContentChange,
}: {
  editorRef: React.RefObject<InlineEditorHandle | null>;
  content: BlockContent;
  onContentChange: (next: BlockContent) => void;
}) {
  const [state, setState] = useState<ToolbarState | null>(null);
  const [colorOpen, setColorOpen] = useState(false);
  const [sizeOpen, setSizeOpen] = useState(false);
  // A ref mirror of state, so the mouseup handler (registered once, closure
  // over stale state otherwise) can read the current toolbar offsets.
  const stateRef = useRef<ToolbarState | null>(null);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const compute = useCallback((): ToolbarState | null => {
    const root = editorRef.current?.getRoot();
    if (!root) return null;
    const sel = document.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    if (
      !root.contains(range.startContainer) ||
      !root.contains(range.endContainer)
    ) {
      return null;
    }
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return null;
    const saved = saveSelection(root);
    if (!saved || saved.start === saved.end) return null;
    return {
      rect: { top: rect.top, left: rect.left + rect.width / 2 },
      from: saved.start,
      to: saved.end,
    };
  }, [editorRef]);

  useEffect(() => {
    function insideToolbar(node: EventTarget | null): boolean {
      return (
        node instanceof Node &&
        (node as HTMLElement).closest?.('[data-toolbar="1"]') != null
      );
    }

    function onMouseDown(e: MouseEvent) {
      // Clicks inside the toolbar don't dismiss it.
      if (insideToolbar(e.target)) return;
      setState(null);
      setColorOpen(false);
      setSizeOpen(false);
    }
    function onMouseUp() {
      // Read selection on the next tick to let the browser finalize it.
      setTimeout(() => setState(compute()), 0);
    }
    function onKeyUp(e: KeyboardEvent) {
      // Show on shift-arrow completion; otherwise let selectionchange handle it.
      if (e.shiftKey || e.key === "Shift") setState(compute());
    }
    function onSelectionChange() {
      // Hide when selection collapses (typing).
      const sel = document.getSelection();
      if (!sel || sel.isCollapsed) {
        // Only hide, don't try to show — showing during selectionchange caused
        // the flicker we're now avoiding.
        if (stateRef.current) setState(null);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("keyup", onKeyUp);
    document.addEventListener("selectionchange", onSelectionChange);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("selectionchange", onSelectionChange);
    };
  }, [compute]);

  if (!state) return null;

  function apply(mutator: (spanCopy: Record<string, unknown>) => void) {
    const s = stateRef.current;
    if (!s) return;
    const next = updateMarksInRange(content, s.from, s.to, (span: Span) => {
      const copy: Record<string, unknown> = { ...span };
      mutator(copy);
      return copy as unknown as Span;
    });
    onContentChange(next);
  }

  function toggleBoolean(mark: BooleanMark) {
    const s = stateRef.current;
    if (!s) return;
    const currentlyOn = rangeHasMark(content, s.from, s.to, mark);
    apply((span) => {
      if (currentlyOn) delete span[mark];
      else span[mark] = true;
    });
  }

  function setColor(color: Color | null) {
    apply((span) => {
      if (color === null) delete span.color;
      else span.color = color;
    });
    setColorOpen(false);
  }

  function setSize(size: Size | null) {
    apply((span) => {
      if (size === null) delete span.size;
      else span.size = size;
    });
    setSizeOpen(false);
  }

  // Position: centered above the selection's top edge, clamped to viewport.
  const TOOLBAR_HEIGHT = 40;
  const PADDING = 8;
  const top = Math.max(PADDING, state.rect.top - TOOLBAR_HEIGHT - 8);
  const left = state.rect.left;

  const toolbar = (
    <div
      data-toolbar="1"
      style={{
        position: "fixed",
        top,
        left,
        transform: "translateX(-50%)",
        zIndex: 60,
        userSelect: "none",
      }}
      className="flex items-center gap-0.5 h-9 px-1.5 rounded-lg border border-border bg-popover shadow-lg text-sm"
    >
      {BOOLEAN_MARKS.map((mark) => {
        const Icon = BOOLEAN_ICON[mark];
        const active = rangeHasMark(content, state.from, state.to, mark);
        return (
          <ToolbarButton
            key={mark}
            active={active}
            title={titleCase(mark)}
            onClick={() => toggleBoolean(mark)}
          >
            <Icon className="size-4" />
          </ToolbarButton>
        );
      })}
      <div className="mx-1 h-5 w-px bg-border" />
      <div className="relative">
        <ToolbarButton
          active={colorOpen}
          title="Text color"
          onClick={() => {
            setColorOpen((o) => !o);
            setSizeOpen(false);
          }}
        >
          <Palette className="size-4" />
        </ToolbarButton>
        {colorOpen && (
          <div
            data-toolbar="1"
            className="absolute top-full left-1/2 -translate-x-1/2 mt-1 flex items-center gap-1 p-1.5 rounded-lg border border-border bg-popover shadow-lg"
          >
            <ColorSwatch title="Default" swatch="var(--foreground)" onClick={() => setColor(null)} />
            {COLORS.map((c) => (
              <ColorSwatch
                key={c}
                title={titleCase(c)}
                swatch={COLOR_SWATCH[c]}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        )}
      </div>
      <div className="relative">
        <ToolbarButton
          active={sizeOpen}
          title="Size"
          onClick={() => {
            setSizeOpen((o) => !o);
            setColorOpen(false);
          }}
        >
          <TypeIcon className="size-4" />
        </ToolbarButton>
        {sizeOpen && (
          <div
            data-toolbar="1"
            className="absolute top-full left-1/2 -translate-x-1/2 mt-1 flex flex-col p-1 rounded-lg border border-border bg-popover shadow-lg"
          >
            <SizePick label="Small" size="small" onClick={() => setSize("small")} />
            <SizePick label="Normal" size={null} onClick={() => setSize(null)} />
            <SizePick label="Large" size="large" onClick={() => setSize("large")} />
          </div>
        )}
      </div>
    </div>
  );

  return typeof document === "undefined"
    ? null
    : createPortal(toolbar, document.body);
}

function ToolbarButton({
  active,
  title,
  onClick,
  children,
}: {
  active: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      data-toolbar="1"
      title={title}
      // Prevent the editor from losing focus / selection when the button is
      // pressed — otherwise apply() would run against an empty selection.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors",
        "hover:bg-accent hover:text-foreground",
        active && "bg-accent text-foreground"
      )}
    >
      {children}
    </button>
  );
}

function ColorSwatch({
  title,
  swatch,
  onClick,
}: {
  title: string;
  swatch: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-toolbar="1"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="size-6 rounded-full border border-border hover:scale-110 transition-transform"
      style={{ background: swatch }}
    />
  );
}

function SizePick({
  label,
  size,
  onClick,
}: {
  label: string;
  size: Size | null;
  onClick: () => void;
}) {
  const preview = size === "small" ? "text-xs" : size === "large" ? "text-lg" : "text-sm";
  return (
    <button
      type="button"
      data-toolbar="1"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-2 py-1 rounded-md text-sm hover:bg-accent",
        preview
      )}
    >
      {label}
    </button>
  );
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

"use client";

import { useEffect, useState } from "react";
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
  SIZES,
  type BlockContent,
  type BooleanMark,
  type Color,
  type Size,
} from "@/lib/block-content";
import {
  rangeHasMark,
  saveSelection,
  updateMarksInRange,
} from "@/lib/span-dom";
import { cn } from "@/lib/utils";
import { type InlineEditorHandle } from "./InlineEditor";

/*
 * Floating selection toolbar — appears above a text range inside the block
 * this component is nested in. Rendered through a portal so it can escape
 * overflow-hidden ancestors and sit at document scope.
 *
 * State model:
 *   - "hidden" when there's no non-collapsed selection inside our editor root.
 *   - "visible" with a computed rect derived from Range.getBoundingClientRect.
 *
 * Positioning: centered above the selection, clamped inside the viewport.
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
  rect: { top: number; left: number; width: number };
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

  useEffect(() => {
    function update() {
      const root = editorRef.current?.getRoot();
      if (!root) return setState(null);
      const sel = document.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        return setState(null);
      }
      const range = sel.getRangeAt(0);
      if (
        !root.contains(range.startContainer) ||
        !root.contains(range.endContainer)
      ) {
        return setState(null);
      }
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return setState(null);
      const saved = saveSelection(root);
      if (!saved) return setState(null);
      setState({
        rect: { top: rect.top, left: rect.left + rect.width / 2, width: rect.width },
        from: saved.start,
        to: saved.end,
      });
    }
    document.addEventListener("selectionchange", update);
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      document.removeEventListener("selectionchange", update);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [editorRef]);

  if (!state) return null;

  function apply(mutator: (spanCopy: Record<string, unknown>) => void) {
    if (!state) return;
    const next = updateMarksInRange(content, state.from, state.to, (span) => {
      const copy: Record<string, unknown> = { ...span };
      mutator(copy);
      return copy as unknown as typeof span;
    });
    onContentChange(next);
  }

  function toggleBoolean(mark: BooleanMark) {
    if (!state) return;
    const currentlyOn = rangeHasMark(content, state.from, state.to, mark);
    apply((s) => {
      if (currentlyOn) {
        delete s[mark];
      } else {
        s[mark] = true;
      }
    });
  }

  function setColor(color: Color | null) {
    apply((s) => {
      if (color === null) delete s.color;
      else s.color = color;
    });
    setColorOpen(false);
  }

  function setSize(size: Size | null) {
    apply((s) => {
      if (size === null) delete s.size;
      else s.size = size;
    });
    setSizeOpen(false);
  }

  // Position: above the selection's top edge, centered horizontally on the
  // selection midpoint. Clamped inside the viewport with a small padding.
  const TOOLBAR_HEIGHT = 40;
  const PADDING = 8;
  const top = Math.max(PADDING, state.rect.top - TOOLBAR_HEIGHT - 8);
  const left = state.rect.left;

  const toolbar = (
    <div
      style={{ position: "fixed", top, left, transform: "translateX(-50%)", zIndex: 60 }}
      onMouseDown={(e) => e.preventDefault()} // keep selection intact
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
          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 flex items-center gap-1 p-1.5 rounded-lg border border-border bg-popover shadow-lg">
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
          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 flex flex-col p-1 rounded-lg border border-border bg-popover shadow-lg">
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
      title={title}
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
      title={title}
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

// Retain type import used indirectly by type-only comments above.
void ({} as Partial<Record<BooleanMark | Color | Size, unknown>>);
// keep SIZES import used by SizePick presets below (referenced in the pick list)
void SIZES;

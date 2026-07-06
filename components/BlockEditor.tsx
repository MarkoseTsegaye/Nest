"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api-client";
import { usePages } from "@/lib/pages-context";
import { useDebouncedCallback } from "@/lib/use-debounced-callback";
import type { Block, PageDetail } from "@/lib/types";

const headingClasses: Record<number, string> = {
  1: "text-2xl font-bold",
  2: "text-xl font-bold",
  3: "text-lg font-semibold",
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
      className={`w-full resize-none outline-none overflow-hidden placeholder:text-gray-300 ${className ?? ""}`}
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
      <div className="group flex items-center gap-2 py-1">
        <Link
          href={`/pages/${block.linkedPageId}`}
          className="flex-1 flex items-center gap-2 rounded px-2 py-1.5 border border-gray-200 hover:bg-gray-50 text-sm"
        >
          <span>📄</span>
          <span className="truncate">{block.linkedPage?.title || "Untitled"}</span>
        </Link>
        <button
          onClick={() => onDelete(block.id)}
          className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-gray-500 text-sm shrink-0"
        >
          ×
        </button>
      </div>
    );
  }

  const isHeading = block.type === "heading";
  const className = isHeading ? headingClasses[block.headingLevel ?? 1] : "text-[15px] leading-6";

  return (
    <div className="group flex items-start gap-2 py-0.5">
      <AutoTextarea
        value={content}
        onChange={handleChange}
        onBlur={handleBlur}
        className={className}
        placeholder={isHeading ? "Heading" : "Type something…"}
      />
      <button
        onClick={() => onDelete(block.id)}
        className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-gray-500 text-sm shrink-0 mt-1"
      >
        ×
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
      <div>
        {page.blocks.map((block) => (
          <BlockRow key={block.id} block={block} onDelete={deleteBlock} />
        ))}
      </div>
      <div className="flex gap-2 mt-4 text-xs text-gray-400">
        <button onClick={() => addBlock("text")} className="hover:text-gray-600">
          + Text
        </button>
        <button onClick={() => addBlock("heading")} className="hover:text-gray-600">
          + Heading
        </button>
        <button onClick={addPageLink} className="hover:text-gray-600">
          + Page link
        </button>
      </div>
    </div>
  );
}

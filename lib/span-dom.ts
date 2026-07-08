import type { BlockContent, Color, Size, Span } from "./block-content";
import { normalizeContent } from "./block-content";

/*
 * DOM ↔ Span[] bridging for the inline editor.
 *
 * Each Span renders as one <span> child of the editor root with data-*
 * attributes for its formatting marks. Adjacent same-marks spans get merged
 * on read via normalizeContent.
 *
 * Selection is tracked as global text offsets (0..totalTextLength) so it
 * survives DOM re-renders — we walk text nodes in the tree to translate to
 * and from browser Range endpoints.
 */

/** Paint a fresh set of children onto `root` reflecting `content`. */
export function renderSpansToDom(root: HTMLElement, content: BlockContent): void {
  root.innerHTML = "";
  if (content.length === 0) return;
  for (const span of content) {
    if (span.text === "") continue;
    root.appendChild(spanToElement(span));
  }
}

function spanToElement(span: Span): HTMLSpanElement {
  const el = document.createElement("span");
  if (span.bold) el.dataset.bold = "1";
  if (span.italic) el.dataset.italic = "1";
  if (span.underline) el.dataset.underline = "1";
  if (span.strike) el.dataset.strike = "1";
  if (span.code) el.dataset.code = "1";
  if (span.color) el.dataset.color = span.color;
  if (span.size) el.dataset.size = span.size;
  el.textContent = span.text;
  return el;
}

/** Read the editor's DOM back into a normalized BlockContent. */
export function readSpansFromDom(root: HTMLElement): BlockContent {
  const out: Span[] = [];
  for (const node of root.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? "";
      if (text) out.push({ text });
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      // Browsers sometimes insert <br> when the editor is emptied.
      if (el.tagName === "BR") continue;
      const text = el.textContent ?? "";
      if (!text) continue;
      const span: Span = { text };
      if (el.dataset.bold === "1") span.bold = true;
      if (el.dataset.italic === "1") span.italic = true;
      if (el.dataset.underline === "1") span.underline = true;
      if (el.dataset.strike === "1") span.strike = true;
      if (el.dataset.code === "1") span.code = true;
      if (el.dataset.color) span.color = el.dataset.color as Color;
      if (el.dataset.size) span.size = el.dataset.size as Size;
      out.push(span);
    }
  }
  return normalizeContent(out);
}

/** Global (0..totalTextLength) offset of a Range endpoint under `root`. */
function offsetOfPoint(root: HTMLElement, container: Node, offset: number): number {
  // If the range endpoint sits on an element (Node.ELEMENT_NODE), `offset`
  // is a childIndex; convert to a preceding-text length.
  if (container.nodeType === Node.ELEMENT_NODE) {
    let acc = 0;
    for (let i = 0; i < offset; i++) {
      acc += (container.childNodes[i]?.textContent ?? "").length;
    }
    return sumTextBefore(root, container) + acc;
  }
  return sumTextBefore(root, container) + offset;
}

function sumTextBefore(root: HTMLElement, target: Node): number {
  let acc = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null = walker.nextNode();
  while (node) {
    if (node === target) return acc;
    if (target.contains(node)) return acc;
    acc += (node.textContent ?? "").length;
    node = walker.nextNode();
  }
  return acc;
}

export interface SavedSelection {
  start: number;
  end: number;
}

/** Snapshot the current browser selection as text offsets under `root`.
 *  Returns null if no selection is inside `root`. */
export function saveSelection(root: HTMLElement): SavedSelection | null {
  const sel = document.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
    return null;
  }
  const start = offsetOfPoint(root, range.startContainer, range.startOffset);
  const end = offsetOfPoint(root, range.endContainer, range.endOffset);
  return { start, end };
}

/** Restore a saved selection. Clamps to available text if the DOM shrank. */
export function restoreSelection(
  root: HTMLElement,
  saved: SavedSelection
): void {
  const totalLen = (root.textContent ?? "").length;
  const start = Math.min(saved.start, totalLen);
  const end = Math.min(saved.end, totalLen);
  const startPos = pointAt(root, start);
  const endPos = pointAt(root, end);
  if (!startPos || !endPos) return;
  const range = document.createRange();
  range.setStart(startPos.node, startPos.offset);
  range.setEnd(endPos.node, endPos.offset);
  const sel = document.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

function pointAt(
  root: HTMLElement,
  offset: number
): { node: Node; offset: number } | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let acc = 0;
  let node: Node | null = walker.nextNode();
  while (node) {
    const len = (node.textContent ?? "").length;
    if (acc + len >= offset) {
      return { node, offset: offset - acc };
    }
    acc += len;
    node = walker.nextNode();
  }
  // Beyond all text: place at end of root.
  if (root.lastChild && root.lastChild.nodeType === Node.TEXT_NODE) {
    return { node: root.lastChild, offset: (root.lastChild.textContent ?? "").length };
  }
  return { node: root, offset: root.childNodes.length };
}

/*
 * Range operations over Span[] — used by the toolbar to toggle marks over a
 * selection. Ranges are inclusive-start, exclusive-end in text-offset space.
 */

/** Split spans so that `from` and `to` fall on span boundaries. Returns a new
 *  content whose spans can be sliced cleanly by offset. */
export function splitAtOffsets(
  content: BlockContent,
  from: number,
  to: number
): BlockContent {
  const out: BlockContent = [];
  let acc = 0;
  for (const span of content) {
    const spanEnd = acc + span.text.length;
    // Local offsets of the split points within this span
    const cuts = [from, to]
      .filter((o) => o > acc && o < spanEnd)
      .map((o) => o - acc)
      .sort((a, b) => a - b);
    if (cuts.length === 0) {
      out.push(span);
    } else {
      let last = 0;
      for (const c of cuts) {
        out.push({ ...span, text: span.text.slice(last, c) });
        last = c;
      }
      out.push({ ...span, text: span.text.slice(last) });
    }
    acc = spanEnd;
  }
  return out;
}

/** Apply a mark-mutating function to every span whose text falls entirely
 *  within [from, to). Spans outside the range are returned unchanged. */
export function updateMarksInRange(
  content: BlockContent,
  from: number,
  to: number,
  mutate: (span: Span) => Span
): BlockContent {
  const split = splitAtOffsets(content, from, to);
  const out: BlockContent = [];
  let acc = 0;
  for (const span of split) {
    const spanEnd = acc + span.text.length;
    if (acc >= from && spanEnd <= to && span.text.length > 0) {
      out.push(mutate(span));
    } else {
      out.push(span);
    }
    acc = spanEnd;
  }
  return normalizeContent(out);
}

/** Whether every span within [from, to) already carries the given boolean
 *  mark — used by the toolbar to render a button's "pressed" state and to
 *  decide whether a click should add or remove the mark. */
export function rangeHasMark(
  content: BlockContent,
  from: number,
  to: number,
  key: keyof Span
): boolean {
  if (from === to) return false;
  let acc = 0;
  for (const span of content) {
    const spanEnd = acc + span.text.length;
    if (acc < to && spanEnd > from) {
      if (!span[key]) return false;
    }
    acc = spanEnd;
  }
  return true;
}

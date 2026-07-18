/*
 * Markdown-shortcut input, Notion-style.
 *
 * Two independent transforms:
 *
 *   1. Inline autoformat — the moment a user types the *closing* delimiter of a
 *      markdown span (`**bold**`, `*italic*`, `_italic_`, `~~strike~~`,
 *      `` `code` ``), the delimiters are stripped and the enclosed run takes the
 *      corresponding mark. Runs in the editor on every input, keyed off the
 *      collapsed caret so it only fires right after the closing delimiter.
 *
 *   2. Block autoformat — typing a block marker plus a space at the very start of
 *      a plain-text block (`# `, `## `, `### `, `- `, `* `, `1. `) converts the
 *      block's type. Handled by the block editor, which owns type conversion.
 *
 * Both work over the Span[] content model. The inline transform decomposes to a
 * per-character array (each char carrying its marks), edits that, then rebuilds
 * and normalizes — correct even when the match straddles existing formatting.
 */
import {
  contentToPlainText,
  normalizeContent,
  type BlockContent,
  type BooleanMark,
  type Span,
} from "./block-content";

type Marks = Omit<Span, "text">;
interface StyledChar {
  ch: string;
  marks: Marks;
}

// UTF-16 unit iteration (not code points) so offsets line up with the DOM
// selection offsets used everywhere else. Astral pairs split into two chars
// with identical marks and get rejoined by normalizeContent.
function toChars(content: BlockContent): StyledChar[] {
  const out: StyledChar[] = [];
  for (const span of content) {
    const { text, ...marks } = span;
    for (let i = 0; i < text.length; i++) out.push({ ch: text[i], marks });
  }
  return out;
}

function fromChars(chars: StyledChar[]): BlockContent {
  return normalizeContent(chars.map((c) => ({ text: c.ch, ...c.marks })));
}

interface InlineRule {
  re: RegExp;
  open: number; // opening delimiter length
  close: number; // closing delimiter length
  mark: BooleanMark;
}

// Order matters: the two-character delimiters are tried before their
// single-character cousins so `**` isn't consumed as two `*`. Group 1 always
// captures the *whole* delimited token (delimiters included) so the offset math
// below is uniform across rules.
const INLINE_RULES: InlineRule[] = [
  { re: /(\*\*\S(?:.*?\S)?\*\*)$/, open: 2, close: 2, mark: "bold" },
  { re: /(~~\S(?:.*?\S)?~~)$/, open: 2, close: 2, mark: "strike" },
  { re: /(?:^|[^*])(\*(?!\*)\S(?:[^*]*\S)?\*)$/, open: 1, close: 1, mark: "italic" },
  { re: /(?:^|[^\w])(_\S(?:[^_]*\S)?_)$/, open: 1, close: 1, mark: "italic" },
  { re: /(`[^`\n]+`)$/, open: 1, close: 1, mark: "code" },
];

export interface InlineResult {
  content: BlockContent;
  caret: number;
}

/**
 * If the text immediately before `caret` completes a markdown inline span,
 * return the reformatted content and the new caret offset. Otherwise null.
 */
export function applyInlineMarkdown(
  content: BlockContent,
  caret: number
): InlineResult | null {
  const plain = contentToPlainText(content);
  if (caret < 2 || caret > plain.length) return null;
  const pre = plain.slice(0, caret);

  for (const rule of INLINE_RULES) {
    const m = rule.re.exec(pre);
    if (!m) continue;
    // Some rules capture a leading boundary char in group 0 but the actual
    // delimited token in group 1 — anchor on the token so offsets are exact.
    const token = m[1];
    const matchStart = caret - token.length;
    const innerStart = matchStart + rule.open;
    const innerEnd = caret - rule.close;
    if (innerEnd <= innerStart) continue;

    const chars = toChars(content);
    for (let i = innerStart; i < innerEnd; i++) {
      chars[i] = { ch: chars[i].ch, marks: { ...chars[i].marks, [rule.mark]: true } };
    }
    // Remove the closing delimiter first (higher indices), then the opening one.
    chars.splice(innerEnd, rule.close);
    chars.splice(matchStart, rule.open);

    return { content: fromChars(chars), caret: innerEnd - rule.open };
  }
  return null;
}

/**
 * Return content with all formatting marks removed from the characters in
 * [from, to). Used to "exit" an inline mark: after `**bold**` autoformats, the
 * next character the user types should be plain, not a continuation of bold.
 */
export function stripMarksInRange(
  content: BlockContent,
  from: number,
  to: number
): BlockContent {
  const chars = toChars(content);
  for (let i = Math.max(0, from); i < Math.min(to, chars.length); i++) {
    chars[i] = { ch: chars[i].ch, marks: {} };
  }
  return fromChars(chars);
}

export type BlockMarkdownType =
  | "heading"
  | "bulleted_list_item"
  | "numbered_list_item";

export interface BlockMarkdownMatch {
  type: BlockMarkdownType;
  headingLevel?: number;
  /** Text after the marker — becomes the converted block's content. */
  rest: string;
}

const BLOCK_RE = /^(#{1,3}|[-*]|\d+\.) (.*)$/;

/**
 * Match a block-level markdown marker at the start of `plain`. Returns the
 * target block type (and any trailing text) or null. Callers should only apply
 * this to plain-text blocks.
 */
export function matchBlockMarkdown(plain: string): BlockMarkdownMatch | null {
  const m = BLOCK_RE.exec(plain);
  if (!m) return null;
  const marker = m[1];
  const rest = m[2];
  if (marker[0] === "#") {
    return { type: "heading", headingLevel: marker.length, rest };
  }
  if (marker === "-" || marker === "*") {
    return { type: "bulleted_list_item", rest };
  }
  return { type: "numbered_list_item", rest };
}

/*
 * Block content — the inline-formatting model.
 *
 * Every text / heading / bulleted-list-item / numbered-list-item block stores
 * its content as an ordered list of Spans. Each Span is a run of plain text
 * plus a set of formatting marks that apply uniformly to that run. This is
 * the flat "rope of styled runs" shape that Notion, Slack, Linear, and most
 * lightweight editors use — no tree, no hierarchical marks, cheap JSON to
 * serialize, cheap to render.
 *
 * Storage: Prisma's Block.content column stays TEXT. The API boundary
 * JSON-parses on read and JSON-stringifies on write, so callers always work
 * with Span[]. Empty content is [].
 *
 * FTS: the SearchIndex trigger extracts plain text from the JSON in the
 * block's content column via SQLite's JSON1 extension (json_each +
 * json_extract), so no denormalized column is needed.
 *
 * Marks are stored as boolean/string fields directly on each Span (not a
 * discriminated union in an array) — one key per formatting attribute makes
 * "does this run have bold" a single property check, both in the editor and
 * in the renderer. Absent means default.
 */

/** Preset color palette (small on purpose). "default" is represented by
 *  omitting the `color` field, so this union only lists the non-default
 *  choices. */
export type Color =
  | "gray"
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "blue"
  | "purple";

export const COLORS: readonly Color[] = [
  "gray",
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
] as const;

/** Font size. `normal` is the default, so this union only lists the non-default
 *  choices. */
export type Size = "small" | "large";

export const SIZES: readonly Size[] = ["small", "large"] as const;

/**
 * One run of styled text. All formatting fields are optional — an absent field
 * means "default" (no bold, normal weight, default color, normal size, etc).
 * This keeps the JSON tiny for the common case of unstyled text.
 */
export interface Span {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  code?: boolean;
  color?: Color;
  size?: Size;
}

export type BlockContent = Span[];

export const EMPTY_CONTENT: BlockContent = [];

/** All the boolean mark keys — used by the editor to toggle over a selection. */
export const BOOLEAN_MARKS = [
  "bold",
  "italic",
  "underline",
  "strike",
  "code",
] as const;
export type BooleanMark = (typeof BOOLEAN_MARKS)[number];

/** Parse a persisted content JSON string into Span[]. Robust: any malformed
 *  input yields an empty array rather than throwing, so an app-level bug in
 *  the writer can't wedge the reader. */
export function parseContent(raw: string | null | undefined): BlockContent {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSpan);
  } catch {
    return [];
  }
}

function isSpan(x: unknown): x is Span {
  return (
    typeof x === "object" &&
    x !== null &&
    "text" in x &&
    typeof (x as { text: unknown }).text === "string"
  );
}

/** Serialize for storage / wire. */
export function serializeContent(content: BlockContent): string {
  return JSON.stringify(content);
}

/** Concatenated plain text of all spans — used for slash-command detection,
 *  empty checks, and as the fallback if a client can't render formatting. */
export function contentToPlainText(content: BlockContent): string {
  let out = "";
  for (const s of content) out += s.text;
  return out;
}

export function isEmptyContent(content: BlockContent): boolean {
  for (const s of content) if (s.text.length > 0) return false;
  return true;
}

/** True if two spans share every formatting attribute. Used to merge adjacent
 *  runs when the editor mutates content — keeps the JSON compact. */
export function spansShareMarks(a: Span, b: Span): boolean {
  return (
    !!a.bold === !!b.bold &&
    !!a.italic === !!b.italic &&
    !!a.underline === !!b.underline &&
    !!a.strike === !!b.strike &&
    !!a.code === !!b.code &&
    (a.color ?? null) === (b.color ?? null) &&
    (a.size ?? null) === (b.size ?? null)
  );
}

/** Merge adjacent same-marks spans and drop empty ones. Idempotent. */
export function normalizeContent(content: BlockContent): BlockContent {
  const out: BlockContent = [];
  for (const span of content) {
    if (span.text === "") continue;
    const prev = out[out.length - 1];
    if (prev && spansShareMarks(prev, span)) {
      out[out.length - 1] = { ...prev, text: prev.text + span.text };
    } else {
      out.push(span);
    }
  }
  return out;
}

/*
 * Full-text search: type + tiny pure helpers shared by the API route, the API
 * client, and the UI. The FTS5 query itself lives in app/api/search/route.ts.
 */

export interface SearchHit {
  kind: "page" | "block";
  pageId: string;
  blockId: string | null;
  title: string;
  /** SQLite `snippet(...)` output — plain text with `<mark>…</mark>` around hits. */
  snippet: string;
}

/**
 * Turn free-form user input into a safe FTS5 MATCH expression. Approach:
 *   - Split on whitespace, drop punctuation-only bits.
 *   - Wrap each token in double quotes (escaping internal quotes) so it's a
 *     literal FTS5 phrase — no operator injection.
 *   - Append `*` to enable prefix matching per token (Google-ish incremental UX).
 *   - Join with a space, which FTS5 treats as implicit AND.
 * Returns null when the input has no usable tokens or is a single character
 * (avoids indexing hell for one-letter queries).
 */
export function buildFtsQuery(raw: string): string | null {
  const tokens = (raw ?? "")
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}]+/gu, ""))
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return null;
  if (tokens.length === 1 && tokens[0].length < 2) return null;
  return tokens.map((t) => `"${t.replace(/"/g, '""')}"*`).join(" ");
}

/**
 * Render a SQLite snippet safely as HTML: escape everything, then unescape our
 * own `<mark>…</mark>` markers. Guards against DB content that itself contains
 * angle brackets — the sanitizer is defensive even though input is our own data.
 */
export function renderSnippetHtml(snippet: string): string {
  const escaped = snippet
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .replace(/&lt;mark&gt;/g, "<mark>")
    .replace(/&lt;\/mark&gt;/g, "</mark>");
}

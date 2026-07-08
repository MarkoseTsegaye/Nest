import {
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Type,
  type LucideIcon,
} from "lucide-react";
import type { BlockType } from "./types";

/*
 * Slash command menu. Triggered when the whole block text is "/word" — a
 * commit converts the block's type (and clears its content). Fuzzy matching
 * ranks candidates so /bul → Enter picks "bulleted".
 */

export interface SlashCommand {
  /** Canonical name (matches "/name"). */
  name: string;
  label: string;
  icon: LucideIcon;
  type: Extract<BlockType, "text" | "heading" | "bulleted_list_item" | "numbered_list_item">;
  headingLevel?: number;
  /** Extra aliases considered by the matcher (short forms, etymological
   *  siblings). Used to score both /num → numbered and /ordered → numbered. */
  aliases?: string[];
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: "h1", label: "Heading 1", icon: Heading1, type: "heading", headingLevel: 1, aliases: ["heading1", "h1", "header1"] },
  { name: "h2", label: "Heading 2", icon: Heading2, type: "heading", headingLevel: 2, aliases: ["heading2", "h2", "header2"] },
  { name: "h3", label: "Heading 3", icon: Heading3, type: "heading", headingLevel: 3, aliases: ["heading3", "h3", "header3"] },
  { name: "bullet", label: "Bulleted list", icon: List, type: "bulleted_list_item", aliases: ["bulleted", "list", "ul", "bullets"] },
  { name: "numbered", label: "Numbered list", icon: ListOrdered, type: "numbered_list_item", aliases: ["number", "ordered", "ol", "num"] },
  { name: "text", label: "Text", icon: Type, type: "text", aliases: ["plain", "paragraph", "p"] },
];

/** Score how well `query` matches `candidate`. Higher = better. 0 = no match.
 *
 * Ranking: exact (1000) > prefix (100 + length bonus) > subsequence (10 + length
 * bonus). This is enough to make single-letter queries useful without dragging
 * in a full fuzzy library. */
function score(query: string, candidate: string): number {
  if (!query) return 0;
  const q = query.toLowerCase();
  const c = candidate.toLowerCase();
  if (q === c) return 1000;
  if (c.startsWith(q)) return 100 + q.length - Math.abs(c.length - q.length) * 0.1;
  // Subsequence: does every char of q appear in c in order?
  let ci = 0;
  for (const ch of q) {
    const next = c.indexOf(ch, ci);
    if (next === -1) return 0;
    ci = next + 1;
  }
  return 10 + q.length - (c.length - q.length) * 0.1;
}

/** Return the top-N slash commands for the query, best first.
 *  An empty query returns the full list in canonical order. */
export function runSlashCommand(query: string, limit = 8): SlashCommand[] {
  if (!query) return SLASH_COMMANDS.slice(0, limit);
  const scored = SLASH_COMMANDS.map((cmd) => {
    const bestName = score(query, cmd.name);
    const bestAlias = Math.max(
      0,
      ...(cmd.aliases?.map((a) => score(query, a)) ?? [])
    );
    return { cmd, score: Math.max(bestName, bestAlias) };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.cmd);
}

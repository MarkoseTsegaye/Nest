import { z } from "zod";
import { type BlockContent, type Color, type Size, type Span } from "./block-content";

/*
 * Shared zod schemas for the on-the-wire inline-formatting content shape.
 * Server routes accept BlockContent (Span[]) as a JSON body, then serialize
 * to a JSON string for storage. GET responses parse the stored string back
 * to Span[] before returning. This keeps the client's `Block.content` typed
 * as BlockContent | null everywhere.
 */

const COLOR_VALUES = ["gray", "red", "orange", "yellow", "green", "blue", "purple"] as const satisfies readonly Color[];
const SIZE_VALUES = ["small", "large"] as const satisfies readonly Size[];

export const spanSchema = z.object({
  text: z.string(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  strike: z.boolean().optional(),
  code: z.boolean().optional(),
  color: z.enum(COLOR_VALUES).optional(),
  size: z.enum(SIZE_VALUES).optional(),
}) satisfies z.ZodType<Span>;

export const blockContentSchema: z.ZodType<BlockContent> = z.array(spanSchema);

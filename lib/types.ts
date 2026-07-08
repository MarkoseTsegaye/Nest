import type { BlockContent } from "./block-content";

export type BlockType =
  | "text"
  | "heading"
  | "bulleted_list_item"
  | "numbered_list_item"
  | "page_link";
export type PropertyType = "text" | "select" | "date";

export interface PageSummary {
  id: string;
  title: string;
  parentId: string | null;
  isDatabase: boolean;
  createdAt: string;
}

export interface Block {
  id: string;
  pageId: string;
  type: BlockType;
  order: number;
  /**
   * Inline-formatted content for text / heading / bulleted-list-item /
   * numbered-list-item blocks. `null` for page_link blocks (which use
   * `linkedPageId` instead). Stored server-side as a JSON string; the API
   * boundary parses/serializes so callers always work with Span[].
   */
  content: BlockContent | null;
  headingLevel: number | null;
  linkedPageId: string | null;
  linkedPage: { id: string; title: string } | null;
}

export interface DatabaseProperty {
  id: string;
  pageId: string;
  name: string;
  type: PropertyType;
  order: number;
  selectOptions: string;
}

export interface PropertyValue {
  id: string;
  pageId: string;
  propertyId: string;
  value: string | null;
  property: DatabaseProperty;
}

export interface RowPage {
  id: string;
  title: string;
  parentId: string | null;
  isDatabase: boolean;
  propertyValues: PropertyValue[];
}

export interface PageDetail {
  id: string;
  title: string;
  parentId: string | null;
  isDatabase: boolean;
  parent: { id: string; title: string } | null;
  blocks: Block[];
  properties: DatabaseProperty[];
  propertyValues: PropertyValue[];
  children: RowPage[];
}

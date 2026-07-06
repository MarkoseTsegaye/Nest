export type BlockType = "text" | "heading" | "page_link";
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
  content: string | null;
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

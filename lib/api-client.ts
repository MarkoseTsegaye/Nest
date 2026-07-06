import type {
  PageSummary,
  PageDetail,
  Block,
  BlockType,
  DatabaseProperty,
  PropertyType,
  PropertyValue,
} from "./types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ? JSON.stringify(body.error) : `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  listPages: () => request<PageSummary[]>("/api/pages"),

  getPage: (id: string) => request<PageDetail>(`/api/pages/${id}`),

  createPage: (data: { title?: string; parentId?: string }) =>
    request<PageSummary>("/api/pages", { method: "POST", body: JSON.stringify(data) }),

  updatePage: (id: string, data: { title?: string; isDatabase?: boolean }) =>
    request<PageSummary>(`/api/pages/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  deletePage: (id: string) => request<void>(`/api/pages/${id}`, { method: "DELETE" }),

  createBlock: (
    pageId: string,
    data: { type: BlockType; content?: string; headingLevel?: number; linkedPageId?: string }
  ) => request<Block>(`/api/pages/${pageId}/blocks`, { method: "POST", body: JSON.stringify(data) }),

  updateBlock: (id: string, data: { content?: string; headingLevel?: number | null; order?: number }) =>
    request<Block>(`/api/blocks/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  deleteBlock: (id: string) => request<void>(`/api/blocks/${id}`, { method: "DELETE" }),

  createProperty: (
    pageId: string,
    data: { name: string; type: PropertyType; selectOptions?: string[] }
  ) => request<DatabaseProperty>(`/api/pages/${pageId}/properties`, { method: "POST", body: JSON.stringify(data) }),

  updateProperty: (id: string, data: { name?: string; selectOptions?: string[] }) =>
    request<DatabaseProperty>(`/api/properties/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  deleteProperty: (id: string) => request<void>(`/api/properties/${id}`, { method: "DELETE" }),

  setPropertyValue: (pageId: string, propertyId: string, value: string | null) =>
    request<PropertyValue>(`/api/pages/${pageId}/property-values`, {
      method: "PUT",
      body: JSON.stringify({ propertyId, value }),
    }),
};

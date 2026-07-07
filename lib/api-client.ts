import type {
  PageSummary,
  PageDetail,
  Block,
  BlockType,
  DatabaseProperty,
  PropertyType,
  PropertyValue,
} from "./types";
import type { SearchHit } from "./search";

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

/*
 * Optimistic writes use client-generated ids and fire in the background, so a
 * write can outrace the create of the thing it depends on (e.g. saving a title
 * before its page row exists). This tiny registry serializes that: every create
 * is tracked by its id, and any dependent write first awaits the relevant
 * create(s). The UI never blocks on this — it has already updated locally; we're
 * only ordering the network calls.
 */
const pendingCreates = new Map<string, Promise<unknown>>();

function track<T>(id: string | undefined, promise: Promise<T>): Promise<T> {
  if (!id) return promise;
  pendingCreates.set(id, promise);
  const cleanup = () => {
    if (pendingCreates.get(id) === promise) pendingCreates.delete(id);
  };
  promise.then(cleanup, cleanup);
  return promise;
}

// Resolves once the create for `id` has settled (or immediately if there's none
// in flight). Never rejects — a failed prerequisite lets the dependent proceed
// and surface its own error, which the UI turns into a resync.
function afterCreate(id: string | undefined): Promise<void> {
  const pending = id ? pendingCreates.get(id) : undefined;
  return pending ? pending.then(() => {}, () => {}) : Promise.resolve();
}

export const api = {
  listPages: () => request<PageSummary[]>("/api/pages"),

  getPage: (id: string) => request<PageDetail>(`/api/pages/${id}`),

  createPage: (data: { id?: string; title?: string; parentId?: string }) => {
    // A child page can't be created before its parent exists.
    const promise = afterCreate(data.parentId).then(() =>
      request<PageSummary>("/api/pages", { method: "POST", body: JSON.stringify(data) })
    );
    return track(data.id, promise);
  },

  updatePage: (id: string, data: { title?: string; isDatabase?: boolean }) =>
    afterCreate(id).then(() =>
      request<PageSummary>(`/api/pages/${id}`, { method: "PATCH", body: JSON.stringify(data) })
    ),

  deletePage: (id: string) =>
    afterCreate(id).then(() => request<void>(`/api/pages/${id}`, { method: "DELETE" })),

  createBlock: (
    pageId: string,
    data: { id?: string; type: BlockType; content?: string; headingLevel?: number; linkedPageId?: string }
  ) => {
    const promise = afterCreate(pageId).then(() =>
      request<Block>(`/api/pages/${pageId}/blocks`, { method: "POST", body: JSON.stringify(data) })
    );
    track(data.id, promise);
    // A page_link block also persists its linked page, so writes to that page
    // must wait for this create too.
    if (data.linkedPageId) track(data.linkedPageId, promise);
    return promise;
  },

  updateBlock: (id: string, data: { content?: string; headingLevel?: number | null; order?: number }) =>
    afterCreate(id).then(() =>
      request<Block>(`/api/blocks/${id}`, { method: "PATCH", body: JSON.stringify(data) })
    ),

  deleteBlock: (id: string) =>
    afterCreate(id).then(() => request<void>(`/api/blocks/${id}`, { method: "DELETE" })),

  createProperty: (
    pageId: string,
    data: { id?: string; name: string; type: PropertyType; selectOptions?: string[] }
  ) => {
    const promise = afterCreate(pageId).then(() =>
      request<DatabaseProperty>(`/api/pages/${pageId}/properties`, {
        method: "POST",
        body: JSON.stringify(data),
      })
    );
    return track(data.id, promise);
  },

  updateProperty: (id: string, data: { name?: string; selectOptions?: string[] }) =>
    afterCreate(id).then(() =>
      request<DatabaseProperty>(`/api/properties/${id}`, { method: "PATCH", body: JSON.stringify(data) })
    ),

  deleteProperty: (id: string) =>
    afterCreate(id).then(() => request<void>(`/api/properties/${id}`, { method: "DELETE" })),

  setPropertyValue: (pageId: string, propertyId: string, value: string | null) =>
    // Needs both the row (page) and the property to exist first.
    Promise.all([afterCreate(pageId), afterCreate(propertyId)]).then(() =>
      request<PropertyValue>(`/api/pages/${pageId}/property-values`, {
        method: "PUT",
        body: JSON.stringify({ propertyId, value }),
      })
    ),

  search: (q: string, limit = 20) =>
    request<SearchHit[]>(
      `/api/search?q=${encodeURIComponent(q)}&limit=${limit}`
    ),
};

// Client-generated ids. We mint the id up front and send it to the server on
// create, so optimistic UI never deals with a "temporary" id that later has to
// be reconciled — the id we render with is the id the row gets persisted under.
export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

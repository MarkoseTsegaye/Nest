import type { Block } from "./types";

/*
 * Undo/redo — the "action" representation and the tiny pure reducer helpers
 * around a per-page history stack.
 *
 * Scope (deliberately narrow — matches the feature spec):
 *   • block content edits — reverting the text in a text/heading block
 *   • block deletes       — restoring a deleted block (content, order, kind)
 *   • cell edits          — reverting a database-row property value
 *
 * Deliberately NOT covered: page create/delete, page rename, adding blocks,
 * schema changes (add property, turn-into-database). Those need different
 * invariants — mixing them into the same stack invites subtle bugs.
 *
 * Not covered because Notion doesn't do them either at the block/undo layer:
 * block reorders (drag-drop isn't in Nest yet), style flips.
 *
 * Every Action carries BOTH sides of the change — its `before` and `after`
 * state — so undo and redo each have everything they need without consulting
 * the current DOM/state. This is the "inverse pair" model: the simplest thing
 * that's not event-sourcing but survives concurrent optimistic edits.
 */

/** A block's text content was edited from `before` to `after`. */
export interface EditBlockContentAction {
  kind: "edit-block-content";
  blockId: string;
  before: string;
  after: string;
}

/** A block was deleted; snapshot lets us reinstate it verbatim at its old slot. */
export interface DeleteBlockAction {
  kind: "delete-block";
  block: Block;
  /** Position within its page's block list at delete time (0-indexed). */
  index: number;
}

/** A database row's cell (property value) was set from `before` to `after`. */
export interface SetPropertyValueAction {
  kind: "set-property-value";
  rowId: string;
  propertyId: string;
  before: string | null;
  after: string | null;
}

export type Action =
  | EditBlockContentAction
  | DeleteBlockAction
  | SetPropertyValueAction;

/**
 * Per-page undo history.
 *
 * `past` is a stack: the most recent action is at the end. Popping the end
 * gives you the next undo target.
 *
 * `future` holds actions that were undone and can be redone. Any brand-new
 * action clears `future` (standard editor behavior: once you edit after
 * undoing, the "redo tail" is discarded).
 */
export interface History {
  past: Action[];
  future: Action[];
}

export const EMPTY_HISTORY: History = { past: [], future: [] };

/** Feature spec: keep only the most recent 10 actions per page. */
export const MAX_HISTORY = 10;

/** Push a fresh action onto the history, capping at MAX_HISTORY and clearing redo. */
export function push(history: History, action: Action): History {
  const past = [...history.past, action].slice(-MAX_HISTORY);
  return { past, future: [] };
}

/**
 * Pop the top of `past` for an undo. Returns the action to invert and the
 * updated history (with the action moved onto `future`). Returns null when
 * there's nothing to undo.
 */
export function popUndo(
  history: History
): { action: Action; next: History } | null {
  if (history.past.length === 0) return null;
  const action = history.past[history.past.length - 1];
  return {
    action,
    next: {
      past: history.past.slice(0, -1),
      future: [action, ...history.future],
    },
  };
}

/**
 * Pop the head of `future` for a redo. Returns the action to reapply and the
 * updated history (with the action moved back onto `past`, still capped).
 * Returns null when there's nothing to redo.
 */
export function popRedo(
  history: History
): { action: Action; next: History } | null {
  if (history.future.length === 0) return null;
  const [action, ...rest] = history.future;
  return {
    action,
    next: {
      past: [...history.past, action].slice(-MAX_HISTORY),
      future: rest,
    },
  };
}

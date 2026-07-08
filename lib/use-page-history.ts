"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  EMPTY_HISTORY,
  popRedo,
  popUndo,
  push,
  type Action,
  type History,
} from "./undo-redo";

/*
 * Per-page undo/redo. History lives inside the component that calls this hook
 * (PageView) — so navigating to another page starts fresh, matching the spec's
 * "action history stack per page session" phrasing.
 *
 * The hook is pure bookkeeping. What each Action *does* (call api.updateBlock,
 * mutate optimistic state, etc.) is PageView's job — passed in as `applyAction`.
 * That keeps this file testable and free of coupling to the API surface.
 */
export function usePageHistory(
  pageId: string,
  applyAction: (action: Action, direction: "undo" | "redo") => void
) {
  const [history, setHistory] = useState<History>(EMPTY_HISTORY);
  const [renderedPageId, setRenderedPageId] = useState(pageId);

  // Reset when navigating between pages (render-time "reset on prop change"
  // pattern — same one used by PageView / SearchDialog).
  if (renderedPageId !== pageId) {
    setRenderedPageId(pageId);
    setHistory(EMPTY_HISTORY);
  }

  // Ref mirror of history for reading inside undo/redo callbacks. The side
  // effect (applyAction) MUST NOT live inside a setState updater — React
  // StrictMode double-invokes those to catch impure reducers, which would
  // apply the action twice (splice a block back in twice, hit the server
  // twice, etc.). Instead we read the current history via ref, apply once,
  // then set the new state as a plain value.
  const historyRef = useRef<History>(history);
  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  const record = useCallback((action: Action) => {
    const next = push(historyRef.current, action);
    historyRef.current = next;
    setHistory(next);
  }, []);

  const undo = useCallback(() => {
    const step = popUndo(historyRef.current);
    if (!step) return;
    applyAction(step.action, "undo");
    historyRef.current = step.next;
    setHistory(step.next);
  }, [applyAction]);

  const redo = useCallback(() => {
    const step = popRedo(historyRef.current);
    if (!step) return;
    applyAction(step.action, "redo");
    historyRef.current = step.next;
    setHistory(step.next);
  }, [applyAction]);

  return {
    record,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
}

/*
 * Only `record` needs to reach BlockEditor / DatabaseView (they capture actions
 * as the user works). Undo/redo triggers live on PageView. A context avoids
 * threading `record` through prop lists.
 */
const RecordActionContext = createContext<((action: Action) => void) | null>(null);

export const RecordActionProvider = RecordActionContext.Provider;

/**
 * Recorder for children. Returns a no-op when no provider is mounted (e.g. in
 * unit tests) so components don't have to null-check.
 */
export function useRecordAction(): (action: Action) => void {
  return useContext(RecordActionContext) ?? (() => {});
}

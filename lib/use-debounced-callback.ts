import { useEffect, useMemo, useRef } from "react";

interface DebouncedFn<Args extends unknown[]> {
  (...args: Args): void;
  /** Discard any pending call. Existing callers ignore this; useful for undo. */
  cancel: () => void;
}

export function useDebouncedCallback<Args extends unknown[]>(
  callback: (...args: Args) => void,
  delay: number
): DebouncedFn<Args> {
  const callbackRef = useRef(callback);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    callbackRef.current = callback;
  });

  useEffect(() => {
    return () => clearTimeout(timeoutRef.current);
  }, []);

  return useMemo(() => {
    const fn = ((...args: Args) => {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => callbackRef.current(...args), delay);
    }) as DebouncedFn<Args>;
    fn.cancel = () => clearTimeout(timeoutRef.current);
    return fn;
  }, [delay]);
}

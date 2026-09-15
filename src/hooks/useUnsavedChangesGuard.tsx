import { useBlocker } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

/**
 * Block in-app navigation while the guard predicate is true, and also warn
 * on browser tab close / refresh via the native beforeunload prompt.
 *
 * Accepts a getter so callers can include ref values (e.g. a `justSavedRef`)
 * that change without triggering a re-render — the predicate is read live
 * on every navigation attempt.
 */
export function useUnsavedChangesGuard(shouldBlock: () => boolean) {
  const fnRef = useRef(shouldBlock);
  fnRef.current = shouldBlock;

  const blocker = useBlocker({
    shouldBlockFn: () => fnRef.current(),
    withResolver: true,
    enableBeforeUnload: () => fnRef.current(),
  });

  // Snapshot once on mount; we re-check inside the handler each fire.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!fnRef.current()) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  return blocker;
}

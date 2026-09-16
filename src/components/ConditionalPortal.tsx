import { createPortal } from "react-dom";
import type { ReactNode } from "react";

const IS_ELECTRON = import.meta.env.VITE_IS_ELECTRON === "true";

/**
 * ReactDOM.createPortal(..., document.body), when the state update that
 * mounts it is triggered by a REAL mouse click, permanently hangs this
 * app's Electron build (see electron/main.cjs for the full investigation).
 * Content positioned with `position: fixed` and viewport-relative
 * coordinates (as all of this app's portaled dropdowns are) looks
 * identical whether it's portaled or left inline, since fixed positioning
 * doesn't depend on DOM ancestry. Use this in place of a bare
 * `createPortal(children, document.body)` call for anything that can pop
 * open from a click, so the same dropdown/menu code works on both web and
 * Electron.
 */
export function ConditionalPortal({ children }: { children: ReactNode }) {
  if (IS_ELECTRON) return <>{children}</>;
  return createPortal(children, document.body);
}

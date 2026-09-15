// Browser shims applied only in the Electron desktop build.
// Loaded first by src/electron-entry.tsx so it runs before any Supabase code.

export function applyElectronShims() {
  if (typeof navigator === "undefined") return;

  // Electron's Chromium can return a null lock from navigator.locks.request,
  // which causes gotrue-js's session lock to hang forever — freezing the UI
  // (including typing in the login form) the moment Supabase tries to read
  // or refresh the session. Removing navigator.locks makes gotrue fall back
  // to its built-in in-memory promise lock, which works reliably in Electron.
  try {
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: undefined,
    });
  } catch (e) {
    console.warn("[electron-shims] could not remove navigator.locks", e);
  }

  // This Electron/Chromium build permanently hangs the renderer's JS thread
  // the instant anything calls element.focus(). Confirmed directly for the
  // login form's programmatic focus (fixed by downgrading Electron -- see
  // electron/main.cjs) and again for Radix Dialog's FocusScope auto-focus
  // (the "Add Product" dialog), which still hangs even on that downgraded
  // version. Radix's Popover/DropdownMenu/Sheet and Select's internal
  // listbox navigation all call element.focus() through the same kind of
  // programmatic path, so they're presumed equally affected even though not
  // each individually reproduced. Neutering the method here is safe: real
  // mouse clicks and keyboard navigation focus elements through Chromium's
  // own native input pipeline, not through this JS-callable method -- only
  // *programmatic* focus() calls (autoFocus, Radix's focus traps, etc.) go
  // through it, and those are exactly what's hanging.
  try {
    const proto = window.HTMLElement.prototype;
    Object.defineProperty(proto, "focus", {
      configurable: true,
      writable: true,
      value: function focus() {
        /* no-op: see comment above */
      },
    });
  } catch (e) {
    console.warn("[electron-shims] could not neuter HTMLElement.focus", e);
  }
}

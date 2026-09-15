// Browser shims applied only in the Electron desktop build.
// Loaded first by src/electron-entry.tsx so it runs before any Supabase code.

export function applyElectronShims() {
  if (typeof navigator === "undefined") return;

  console.log("[electron-shims] applying shims, build marker: focus-neutered-v2");

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
  // the instant anything calls element.focus() programmatically (confirmed
  // for the login form's own focus() call, and for Radix's FocusScope
  // auto-focus). Neutering the method here is safe: real mouse clicks and
  // keyboard navigation focus elements through Chromium's own native input
  // pipeline, not through this JS-callable method.
  //
  // This does NOT fully fix the Electron freeze, though. Opening a dialog
  // via a REAL mouse click (reproduced with webContents.sendInputEvent, but
  // never with a synthetic element.click()) still hangs the renderer even
  // with focus() neutered, FocusScope's trapping disabled, useFocusGuards
  // disabled, and a fully custom Radix-free dialog with no focusable
  // content at all. See the "Known unresolved issue" note in
  // electron/main.cjs -- this remains open.
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

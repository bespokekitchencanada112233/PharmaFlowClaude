// Browser shims applied only in the Electron desktop build.
// Loaded first by src/electron-entry.tsx so it runs before any Supabase code.

declare global {
  interface Window {
    electronAPI?: {
      signInWithGoogle: (
        brokerUrl: string,
        redirectUri: string,
      ) => Promise<
        | { ok: true; access_token: string; refresh_token: string }
        | { ok: false; error: string }
      >;
    };
  }
}

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

}

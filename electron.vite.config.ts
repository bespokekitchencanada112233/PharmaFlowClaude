import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { resolve } from "node:path";

function electronPwaStub() {
  const virtualId = "virtual:pwa-register";
  const resolvedId = "\0electron-pwa-register";

  return {
    name: "electron-pwa-stub",
    resolveId(id: string) {
      return id === virtualId ? resolvedId : null;
    },
    load(id: string) {
      if (id !== resolvedId) return null;
      return "export function registerSW() { return function unregister() {}; }";
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [electronPwaStub(), react(), tsconfigPaths(), tailwindcss()],
  resolve: {
    alias: {
      "@tanstack/react-start": resolve(__dirname, "src/lib/electron-server-fn-stub.ts"),
      "@/lib/users.functions": resolve(__dirname, "src/lib/users.functions.electron.ts"),
      "@/components/ui/dialog": resolve(__dirname, "src/components/ui/dialog.electron.tsx"),
      "@/components/ui/alert-dialog": resolve(__dirname, "src/components/ui/alert-dialog.electron.tsx"),
      "@/components/ui/dropdown-menu": resolve(__dirname, "src/components/ui/dropdown-menu.electron.tsx"),
      "@/components/ui/sheet": resolve(__dirname, "src/components/ui/sheet.electron.tsx"),
      "@/components/ui/select": resolve(__dirname, "src/components/ui/select.electron.tsx"),
      "@/components/ui/popover": resolve(__dirname, "src/components/ui/popover.electron.tsx"),
    },
  },
  build: {
    outDir: "dist/client",
    emptyOutDir: false,
    manifest: ".vite/electron-manifest.json",
    rollupOptions: {
      input: {
        "electron-entry": resolve(__dirname, "src/electron-entry.tsx"),
      },
    },
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    "process.env.TSS_ROUTER_BASEPATH": JSON.stringify("/"),
    "import.meta.env.VITE_IS_ELECTRON": JSON.stringify("true"),
    global: "globalThis",
  },
});
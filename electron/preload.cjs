// Runs in the sandboxed renderer's isolated preload context. Exposes a
// minimal, safe surface for the SQLite-backed store in db.cjs -- the
// renderer never touches the database or Node APIs directly, only these
// three IPC calls.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronDB", {
  get: (key) => ipcRenderer.invoke("db:get", key),
  set: (key, value) => ipcRenderer.invoke("db:set", key, value),
  del: (key) => ipcRenderer.invoke("db:del", key),
});

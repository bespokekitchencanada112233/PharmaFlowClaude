// NOTE: package.json pins electron to exactly 30.5.1. Electron 33+ (Chromium
// 148, confirmed on 33.4.11 and 35.7.5) has a renderer bug where any
// programmatic HTMLElement.focus() call on this app's page permanently
// hangs the renderer's JS thread the instant TanStack Router's
// <RouterProvider> is mounted -- reproduced with a minimal root-only route
// tree, ruled out our own code (CSS, React, Supabase, service worker,
// GPU/accessibility/autofill switches all irrelevant). Downgrading Electron
// fixed this specific case (confirmed: typing a full email + password in
// the login form). Do not bump this past 30.x without re-testing that.
//
// SECOND BUG, fully isolated: ReactDOM.createPortal(..., document.body),
// when the state update that mounts it is triggered by a REAL/trusted
// native mouse click (reproduced with webContents.sendInputEvent -- never
// with a synthetic element.click(), which is why this was missed for a
// long time), permanently hangs this same Electron/Chromium build's
// renderer -- independent of focus, FocusScope, or content (reproduced
// down to a single hidden, empty <span> portaled to document.body). A
// plain inline state update on the same click, with no portal, works fine.
// Fix: src/components/ui/dialog.electron.tsx replaces the Radix-based
// dialog.tsx for the Electron build only (aliased in
// electron.vite.config.ts) with one that never calls createPortal,
// rendering inline and relying on CSS `position: fixed` to appear as a
// full-screen overlay instead. Verified end-to-end with real mouse clicks
// and real keystrokes (open dialog, click into a field, type, stays
// responsive). Any other component using createPortal in the Electron
// build (Popover, DropdownMenu, Sheet, AlertDialog, etc.) needs the same
// treatment -- check for this class of hang if one of those starts
// freezing on a real click.
const { app, BrowserWindow, Menu, shell, ipcMain } = require("electron");
const path = require("path");
const http = require("http");
const fs = require("fs");
const { initDb, dbGet, dbSet, dbDel } = require("./db.cjs");

const CLIENT_DIR = path.join(__dirname, "..", "dist", "client");
const APP_ICON = path.join(CLIENT_DIR, "icon-512.png");

const MIME_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".webmanifest": "application/manifest+json",
};

// Serves the pre-built SPA from disk, falling back to index.html for any
// extension-less path so client-side routes survive a hard reload.
function createStaticServer(rootDir) {
  return http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    const requestedPath = path.normalize(path.join(rootDir, pathname));

    if (!requestedPath.startsWith(rootDir)) {
      res.writeHead(403).end("Forbidden");
      return;
    }

    let filePath;
    if (pathname === "/") {
      filePath = path.join(rootDir, "index.html");
    } else if (fs.existsSync(requestedPath) && fs.statSync(requestedPath).isFile()) {
      filePath = requestedPath;
    } else if (fs.existsSync(path.join(requestedPath, "index.html"))) {
      filePath = path.join(requestedPath, "index.html");
    } else if (!path.extname(pathname)) {
      // No file extension and nothing on disk: treat as a client-side route.
      filePath = path.join(rootDir, "index.html");
    } else {
      res.writeHead(404).end("Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.setHeader("Content-Type", MIME_TYPES[ext] || "application/octet-stream");
    res.setHeader("Cache-Control", ext === ".html" ? "no-cache" : "public, max-age=31536000");

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
    stream.on("error", () => {
      res.writeHead(500).end("Internal error");
    });
  });
}

function buildMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac ? [{ role: "appMenu" }] : []),
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { type: "separator" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { role: "windowMenu" },
  ];
  return Menu.buildFromTemplate(template);
}

let server;
let mainWindow;

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    icon: APP_ICON,
    title: "Umar Medicine ERP",
    backgroundColor: "#ffffff",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}/`);

  // Open external links (e.g. WhatsApp share, "or" links) in the OS browser
  // instead of navigating the app window away from the SPA.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("console-message", (_event, _level, message) => {
    console.log("[renderer]", message);
  });
}

// Fixed, not 0/random: the login session is stored in browser storage keyed
// to this exact origin (http://127.0.0.1:PORT). A different port on every
// launch meant a different storage partition each time -- last session's
// saved login was invisible to the new one, forcing a fresh sign-in every
// single time the app opened. Falls back to a random port only if this one
// is somehow already taken (session then won't persist across restarts
// until it frees up, but the app still opens).
const APP_PORT = 47821;

function startServerAndWindow() {
  server = createStaticServer(CLIENT_DIR);

  const onListening = () => {
    const { port } = server.address();
    console.log(`[electron] serving ${CLIENT_DIR} on http://127.0.0.1:${port}/`);
    createWindow(port);
  };

  server.once("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.warn(`[electron] port ${APP_PORT} in use, falling back to a random port`);
      server.listen(0, "127.0.0.1", onListening);
    } else {
      throw err;
    }
  });
  server.listen(APP_PORT, "127.0.0.1", onListening);
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    if (!fs.existsSync(path.join(CLIENT_DIR, "index.html"))) {
      throw new Error(
        `Electron client build not found at ${CLIENT_DIR}. Run "npm run electron:build" first.`,
      );
    }

    await initDb(app.getPath("userData"));
    ipcMain.handle("db:get", (_event, key) => dbGet(key));
    ipcMain.handle("db:set", (_event, key, value) => dbSet(key, value));
    ipcMain.handle("db:del", (_event, key) => dbDel(key));

    Menu.setApplicationMenu(buildMenu());
    startServerAndWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        startServerAndWindow();
      }
    });
  });

  app.on("window-all-closed", () => {
    if (server) server.close();
    if (process.platform !== "darwin") app.quit();
  });
}

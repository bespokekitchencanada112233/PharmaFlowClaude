// NOTE: package.json pins electron to exactly 30.5.1. Electron 33+ (Chromium
// 148, confirmed on 33.4.11 and 35.7.5) has a renderer bug where any
// HTMLElement.focus() call on this app's page permanently hangs the
// renderer's JS thread the instant TanStack Router's <RouterProvider> is
// mounted -- reproduced with a minimal root-only route tree, ruled out our
// own code (CSS, React, Supabase, service worker, GPU/accessibility/autofill
// switches all irrelevant). Only fix found was downgrading Electron itself.
// Do not bump this past 30.x without re-testing that typing in the login
// form actually works in a real packaged build.
const { app, BrowserWindow, Menu, shell } = require("electron");
const path = require("path");
const http = require("http");
const fs = require("fs");

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

function startServerAndWindow() {
  server = createStaticServer(CLIENT_DIR);
  server.listen(0, "127.0.0.1", () => {
    const { port } = server.address();
    console.log(`[electron] serving ${CLIENT_DIR} on http://127.0.0.1:${port}/`);
    createWindow(port);
  });
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

  app.whenReady().then(() => {
    if (!fs.existsSync(path.join(CLIENT_DIR, "index.html"))) {
      throw new Error(
        `Electron client build not found at ${CLIENT_DIR}. Run "npm run electron:build" first.`,
      );
    }

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

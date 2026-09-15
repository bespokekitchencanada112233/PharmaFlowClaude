const { app, BrowserWindow } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

const PORT = 0; // 0 = auto-assign

// Simple static file server
function serveStatic(rootDir) {
  return http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;

    // Default to index.html for SPA routing
    let filePath = path.join(rootDir, pathname);
    if (pathname === '/' || pathname === '/index.html') {
      filePath = path.join(rootDir, 'index.html');
    }

    // Security: prevent directory traversal
    if (!filePath.startsWith(rootDir)) {
      res.statusCode = 403;
      res.end('Forbidden');
      return;
    }

    // If it's a directory, look for index.html
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    // For SPA routes that don't exist as files, serve index.html
    if (!fs.existsSync(filePath)) {
      // Check if it's likely an asset (has extension)
      const ext = path.extname(pathname);
      if (!ext || ext === '.html') {
        filePath = path.join(rootDir, 'index.html');
      } else {
        res.statusCode = 404;
        res.end('Not found');
        return;
      }
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.woff2': 'font/woff2',
      '.woff': 'font/woff',
      '.ttf': 'font/ttf',
      '.webmanifest': 'application/manifest+json',
    };

    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=31536000');

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
    stream.on('error', () => {
      res.statusCode = 500;
      res.end('Internal error');
    });
  });
}

let server;
let serverPort;

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, '..', 'dist', 'client', 'icon-192.png'),
    title: 'Umar Medicine ERP',
  });

  // Load from the local server
  win.loadURL(`http://localhost:${serverPort}/`);

  // Optional: open DevTools for debugging
  // win.webContents.openDevTools();
}

app.whenReady().then(() => {
  const staticRoot = path.join(__dirname, '..', 'dist', 'client');
  server = serveStatic(staticRoot);
  server.listen(PORT, '127.0.0.1', () => {
    serverPort = server.address().port;
    console.log(`Server running on http://localhost:${serverPort}/`);
    createWindow();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (server) {
    server.close();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

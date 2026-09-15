// Generates dist/client/index.html from the Vite manifest so the Electron
// shell always loads the correct hashed entry chunk + CSS.
const fs = require('fs');
const path = require('path');

const clientDir = path.join(__dirname, '..', 'dist', 'client');
const electronManifestPath = path.join(clientDir, '.vite', 'electron-manifest.json');
const webManifestPath = path.join(clientDir, '.vite', 'manifest.json');
const manifestPath = fs.existsSync(electronManifestPath)
  ? electronManifestPath
  : webManifestPath;

if (!fs.existsSync(manifestPath)) {
  console.error('[generate-index] manifest not found:', manifestPath);
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

// Find the dedicated Electron client entry. It uses createRoot instead of
// TanStack Start's SSR hydration entry, because this packaged app ships a
// static HTML shell without SSR bootstrap data.
const entries = Object.values(manifest).filter((c) => c.isEntry);
const entry =
  entries.find((c) => /src\/electron-entry\.tsx$/.test(c.src || "")) ||
  entries.find((c) => /electron-entry/i.test(c.file || "")) ||
  entries.find((c) => /client-entry|virtual.*client/i.test(c.src || c.file)) ||
  entries[0];

if (!entry) {
  console.error('[generate-index] no entry chunk found in manifest');
  process.exit(1);
}

// Collect CSS: entry.css plus any standalone .css chunks in the manifest.
const cssSet = new Set(entry.css || []);
for (const chunk of Object.values(manifest)) {
  if (chunk.file && chunk.file.endsWith('.css')) cssSet.add(chunk.file);
  for (const c of chunk.css || []) cssSet.add(c);
}
const cssLinks = [...cssSet]
  .map((href) => `  <link rel="stylesheet" href="./${href}">`)
  .join('\n');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#1c2240">
  <title>Umar Medicine ERP</title>
${cssLinks}
  <link rel="icon" href="./icon-192.png" type="image/png">
</head>
<body>
  <div id="root"></div>
  <script>window.__TSS_START_OPTIONS__ = { serializationAdapters: [] };</script>
  <script type="module" src="./${entry.file}"></script>
</body>
</html>
`;

const outPath = path.join(clientDir, 'index.html');
fs.writeFileSync(outPath, html);
console.log('[generate-index] wrote', outPath, '→ entry:', entry.file);

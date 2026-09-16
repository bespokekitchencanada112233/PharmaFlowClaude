// Local persistent store for offline data (snapshot + sync queue), used in
// place of the web build's IndexedDB. Backed by sql.js (WASM SQLite)
// instead of a native module like better-sqlite3 -- this avoids needing a
// C++ toolchain (Visual Studio Build Tools) on the machine building/running
// this app, at the cost of persisting via a full re-export-and-write on
// every mutation rather than native incremental writes. Fine for this
// app's data volume (a single business's invoices/products/customers).
const initSqlJs = require("sql.js");
const path = require("path");
const fs = require("fs");

let db;
let dbPath;

async function initDb(userDataDir) {
  const SQL = await initSqlJs();
  dbPath = path.join(userDataDir, "pharma-flow.db");
  const fileBuffer = fs.existsSync(dbPath) ? fs.readFileSync(dbPath) : null;
  db = fileBuffer ? new SQL.Database(fileBuffer) : new SQL.Database();
  db.run("CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  if (!fileBuffer) persist();
  console.log(`[db] sqlite store ready at ${dbPath}`);
}

function persist() {
  fs.writeFileSync(dbPath, Buffer.from(db.export()));
}

function dbGet(key) {
  const result = db.exec("SELECT value FROM kv WHERE key = ?", [key]);
  if (!result.length || !result[0].values.length) return null;
  try {
    return JSON.parse(result[0].values[0][0]);
  } catch {
    return null;
  }
}

function dbSet(key, value) {
  db.run(
    "INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, JSON.stringify(value)],
  );
  persist();
}

function dbDel(key) {
  db.run("DELETE FROM kv WHERE key = ?", [key]);
  persist();
}

module.exports = { initDb, dbGet, dbSet, dbDel };

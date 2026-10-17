import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import initSqlJs, { type Database } from "sql.js";

const nodeRequire = createRequire(__filename);

const dataDir = path.resolve(__dirname, "../data");
const dbPath = path.join(dataDir, "market.db");

let db: Database | null = null;

const saveDatabase = () => {
  if (!db) return;

  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
};

export const getDatabase = async (): Promise<Database> => {
  if (db) return db;

  fs.mkdirSync(dataDir, { recursive: true });

  const SQL = await initSqlJs({
    locateFile: (file) => nodeRequire.resolve(`sql.js/dist/${file}`),
  });

  if (fs.existsSync(dbPath)) {
    const file = fs.readFileSync(dbPath);
    db = new SQL.Database(new Uint8Array(file));
  } else {
    db = new SQL.Database();
  }

  db.run(`
  CREATE TABLE IF NOT EXISTS market_items (
    app_id INTEGER NOT NULL,
    market_hash_name TEXT NOT NULL,
    name TEXT NOT NULL,
    market_url TEXT NOT NULL,
    image_url TEXT,
    current_price REAL,
    volume INTEGER,
    updated_at TEXT,
    next_update_at TEXT,
    PRIMARY KEY (app_id, market_hash_name)
  );

  CREATE TABLE IF NOT EXISTS price_history (
    app_id INTEGER NOT NULL,
    market_hash_name TEXT NOT NULL,
    date TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    price REAL NOT NULL,
    volume INTEGER NOT NULL,
    PRIMARY KEY (app_id, market_hash_name, timestamp)
  );

  CREATE TABLE IF NOT EXISTS scanner_history_cache (
    app_id INTEGER NOT NULL,
    market_hash_name TEXT NOT NULL,
    currency TEXT NOT NULL,
    fetched_at INTEGER NOT NULL,
    PRIMARY KEY (app_id, market_hash_name)
  );

  CREATE TABLE IF NOT EXISTS scanner_history_queue (
    app_id INTEGER NOT NULL,
    market_hash_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (app_id, market_hash_name)
  );

  CREATE TABLE IF NOT EXISTS scanner_history_worker_state (
    app_id INTEGER PRIMARY KEY,
    pause_until INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_scanner_history_queue_next
    ON scanner_history_queue (status, next_attempt_at);

  CREATE INDEX IF NOT EXISTS idx_market_items_next_update
    ON market_items (next_update_at);

  CREATE INDEX IF NOT EXISTS idx_price_history_item
    ON price_history (app_id, market_hash_name, timestamp);
`);

  const columns = db.prepare("PRAGMA table_info(market_items)");
  let hasImageUrl = false;

  try {
    while (columns.step()) {
      const row = columns.getAsObject();
      if (row.name === "image_url") {
        hasImageUrl = true;
        break;
      }
    }
  } finally {
    columns.free();
  }

  if (!hasImageUrl) {
    db.run("ALTER TABLE market_items ADD COLUMN image_url TEXT");
  }

  saveDatabase();

  return db;
};

export const persistDatabase = () => {
  saveDatabase();
};

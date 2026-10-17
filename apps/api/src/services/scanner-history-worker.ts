import { getDatabase, persistDatabase } from "../db";
import { getStoredSteamCatalog } from "./catalog";
import {
  getCachedScannerPriceHistory,
  getScannerPriceHistory,
  SteamRateLimitError,
} from "./scanner-price-history";
import { getActiveSteamSession } from "./steam-session";

const MIN_PRICE_UAH = 7;
const MAX_PRICE_UAH = 5000;

const REQUEST_DELAY_MS = 300;
const IDLE_DELAY_MS = 10_000;
const DEFAULT_PAUSE_MS = 15 * 60 * 1000;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

interface QueueItem {
  app_id: number;
  market_hash_name: string;
  attempts: number;
}

let workerPromise: Promise<void> | null = null;
let stopRequested = false;

const ensureWorkerTables = async (): Promise<void> => {
  const db = await getDatabase();

  db.run(`
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

    CREATE INDEX IF NOT EXISTS idx_scanner_history_queue_next
      ON scanner_history_queue (status, next_attempt_at);

    CREATE TABLE IF NOT EXISTS scanner_history_worker_state (
      app_id INTEGER PRIMARY KEY,
      pause_until INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      updated_at INTEGER NOT NULL
    );
  `);

  persistDatabase();
};

const enqueueCatalogItems = async (appId: number): Promise<void> => {
  const catalog = await getStoredSteamCatalog(appId);
  const db = await getDatabase();
  const now = Date.now();

  db.run("BEGIN TRANSACTION");

  try {
    const statement = db.prepare(`
      INSERT OR IGNORE INTO scanner_history_queue (
        app_id,
        market_hash_name,
        status,
        attempts,
        next_attempt_at,
        updated_at
      )
      VALUES (?, ?, 'pending', 0, 0, ?)
    `);

    try {
      for (const item of catalog) {
        const price = item.sellPrice;

        if (price === null || price < MIN_PRICE_UAH || price > MAX_PRICE_UAH) {
          continue;
        }

        statement.run([appId, item.marketHashName, now]);
      }
    } finally {
      statement.free();
    }

    db.run("COMMIT");
  } catch (error) {
    db.run("ROLLBACK");
    throw error;
  }

  persistDatabase();
};

const getPauseUntil = async (appId: number): Promise<number> => {
  const db = await getDatabase();
  const statement = db.prepare(`
    SELECT pause_until
    FROM scanner_history_worker_state
    WHERE app_id = ?
  `);

  statement.bind([appId]);

  try {
    if (!statement.step()) return 0;
    return Number(statement.getAsObject().pause_until ?? 0);
  } finally {
    statement.free();
  }
};

const setPause = async (
  appId: number,
  pauseUntil: number,
  error: string,
): Promise<void> => {
  const db = await getDatabase();

  db.run(
    `
      INSERT INTO scanner_history_worker_state (
        app_id,
        pause_until,
        last_error,
        updated_at
      )
      VALUES (?, ?, ?, ?)
      ON CONFLICT(app_id) DO UPDATE SET
        pause_until = excluded.pause_until,
        last_error = excluded.last_error,
        updated_at = excluded.updated_at
    `,
    [appId, pauseUntil, error, Date.now()],
  );

  persistDatabase();
};

const clearPause = async (appId: number): Promise<void> => {
  const db = await getDatabase();

  db.run(
    `
      UPDATE scanner_history_worker_state
      SET pause_until = 0,
          last_error = NULL,
          updated_at = ?
      WHERE app_id = ?
    `,
    [Date.now(), appId],
  );

  persistDatabase();
};

const getNextQueueItem = async (appId: number): Promise<QueueItem | null> => {
  const db = await getDatabase();

  const statement = db.prepare(`
  SELECT app_id, market_hash_name, attempts
  FROM scanner_history_queue
  WHERE app_id = ?
    AND status = 'pending'
    AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
  ORDER BY next_attempt_at ASC, updated_at ASC
  LIMIT 1
`);

  statement.bind([appId, Date.now()]);

  try {
    if (!statement.step()) return null;

    const row = statement.getAsObject();

    return {
      app_id: Number(row.app_id),
      market_hash_name: String(row.market_hash_name),
      attempts: Number(row.attempts),
    };
  } finally {
    statement.free();
  }
};

const updateQueueItem = async (
  appId: number,
  marketHashName: string,
  status: "pending" | "completed" | "failed",
  options: {
    attempts?: number;
    nextAttemptAt?: number;
    error?: string | null;
  } = {},
): Promise<void> => {
  const db = await getDatabase();

  db.run(
    `
      UPDATE scanner_history_queue
      SET status = ?,
          attempts = COALESCE(?, attempts),
          next_attempt_at = COALESCE(?, next_attempt_at),
          last_error = ?,
          updated_at = ?
      WHERE app_id = ? AND market_hash_name = ?
    `,
    [
      status,
      options.attempts ?? null,
      options.nextAttemptAt ?? null,
      options.error ?? null,
      Date.now(),
      appId,
      marketHashName,
    ],
  );

  persistDatabase();
};

const processQueueItem = async (item: QueueItem): Promise<void> => {
  const { app_id: appId, market_hash_name: marketHashName } = item;

  try {
    const cached = await getCachedScannerPriceHistory(appId, marketHashName);

    if (cached) {
      console.log(
        "[History worker] Cache hit:",
        marketHashName,
        cached.points.length,
      );
    } else {
      console.log("[History worker] Fetching from Steam:", marketHashName);

      const session = getActiveSteamSession();

      if (!session) {
        throw new Error("Steam session unavailable");
      }

      await getScannerPriceHistory(session.steamId, appId, marketHashName);
    }

    await updateQueueItem(appId, marketHashName, "completed", {
      error: null,
    });

    console.log(`[History worker] Saved: ${marketHashName}`);
  } catch (error) {
    if (error instanceof SteamRateLimitError) {
      const pauseUntil = Date.now() + error.retryAfterMs;

      await updateQueueItem(appId, marketHashName, "pending", {
        attempts: item.attempts + 1,
        nextAttemptAt: pauseUntil,
        error: error.message,
      });

      await setPause(appId, pauseUntil, error.message);

      console.warn(
        `[History worker] HTTP 429. Paused until ${new Date(
          pauseUntil,
        ).toISOString()}`,
      );

      return;
    }

    const message = error instanceof Error ? error.message : "Unknown error";

    if (/HTTP 400/.test(message)) {
      await updateQueueItem(appId, marketHashName, "failed", {
        attempts: item.attempts + 1,
        error: message,
      });
      return;
    }

    if (/HTTP 403/.test(message)) {
      const pauseUntil = Date.now() + DEFAULT_PAUSE_MS;

      await updateQueueItem(appId, marketHashName, "pending", {
        attempts: item.attempts + 1,
        nextAttemptAt: pauseUntil,
        error: message,
      });

      await setPause(appId, pauseUntil, message);
      return;
    }

    const retryAt = Date.now() + 60_000;

    await updateQueueItem(appId, marketHashName, "pending", {
      attempts: item.attempts + 1,
      nextAttemptAt: retryAt,
      error: message,
    });

    console.error(`[History worker] Failed: ${marketHashName}: ${message}`);
  }
};

const runWorker = async (appId: number): Promise<void> => {
  await ensureWorkerTables();

  console.log(`[History worker] Started for app ${appId}`);

  while (!stopRequested) {
    try {
      await enqueueCatalogItems(appId);

      const pauseUntil = await getPauseUntil(appId);

      if (pauseUntil > Date.now()) {
        await sleep(Math.min(pauseUntil - Date.now(), 30_000));
        continue;
      }

      if (pauseUntil !== 0) {
        await clearPause(appId);
      }

      const item = await getNextQueueItem(appId);

      if (!item) {
        await sleep(IDLE_DELAY_MS);
        continue;
      }

      await processQueueItem(item);

      if (!stopRequested) {
        await sleep(REQUEST_DELAY_MS);
      }
    } catch (error) {
      console.error("[History worker] Loop error:", error);
      await sleep(IDLE_DELAY_MS);
    }
  }

  console.log(`[History worker] Stopped for app ${appId}`);
};

export const startScannerHistoryWorker = (appId: number): void => {
  if (workerPromise) {
    console.warn("[History worker] Already running");
    return;
  }

  stopRequested = false;

  workerPromise = runWorker(appId).finally(() => {
    workerPromise = null;
  });
};

export const stopScannerHistoryWorker = (): void => {
  stopRequested = true;
};

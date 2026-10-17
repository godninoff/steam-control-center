import { getDatabase, persistDatabase } from "../db";
import { getActiveSteamSession } from "./steam-session";

interface SteamPriceHistoryResponse {
  success?: boolean;
  price_prefix?: string;
  price_suffix?: string;
  prices?: Array<[string, number | string, string | number]>;
}

export interface SteamPricePoint {
  date: string;
  timestamp: number;
  price: number;
  volume: number;
}

export interface ScannerPriceHistory {
  appId: number;
  marketHashName: string;
  currency: string;
  points: SteamPricePoint[];
}

export class SteamRateLimitError extends Error {
  constructor(
    message: string,
    public readonly retryAfterMs: number,
  ) {
    super(message);
    this.name = "SteamRateLimitError";
  }
}

const cache = new Map<
  string,
  { expiresAt: number; data: ScannerPriceHistory }
>();

const CACHE_TTL = 24 * 60 * 60 * 1000;
const DEFAULT_RATE_LIMIT_DELAY_MS = 15 * 60 * 1000;

const getKey = (appId: number, marketHashName: string) =>
  `${appId}:${marketHashName}`;

const readFromDatabase = async (
  appId: number,
  marketHashName: string,
): Promise<ScannerPriceHistory | null> => {
  const db = await getDatabase();

  const metadata = db.prepare(`
    SELECT currency, fetched_at
    FROM scanner_history_cache
    WHERE app_id = ? AND market_hash_name = ?
  `);

  metadata.bind([appId, marketHashName]);

  let currency = "";
  let fetchedAt = 0;

  try {
    if (!metadata.step()) return null;

    const row = metadata.getAsObject();
    currency = String(row.currency ?? "");
    fetchedAt = Number(row.fetched_at);
  } finally {
    metadata.free();
  }

  if (Date.now() - fetchedAt >= CACHE_TTL) {
    return null;
  }

  const statement = db.prepare(`
    SELECT date, timestamp, price, volume
    FROM price_history
    WHERE app_id = ? AND market_hash_name = ?
    ORDER BY timestamp
  `);

  statement.bind([appId, marketHashName]);

  const points: SteamPricePoint[] = [];

  try {
    while (statement.step()) {
      const row = statement.getAsObject();

      points.push({
        date: String(row.date),
        timestamp: Number(row.timestamp),
        price: Number(row.price),
        volume: Number(row.volume),
      });
    }
  } finally {
    statement.free();
  }

  return {
    appId,
    marketHashName,
    currency,
    points,
  };
};

const saveToDatabase = async (history: ScannerPriceHistory): Promise<void> => {
  const db = await getDatabase();

  db.run("BEGIN TRANSACTION");

  try {
    const insertPoint = db.prepare(`
      INSERT OR REPLACE INTO price_history
        (app_id, market_hash_name, date, timestamp, price, volume)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    try {
      for (const point of history.points) {
        insertPoint.run([
          history.appId,
          history.marketHashName,
          point.date,
          point.timestamp,
          point.price,
          point.volume,
        ]);
      }
    } finally {
      insertPoint.free();
    }

    const metadata = db.prepare(`
      INSERT OR REPLACE INTO scanner_history_cache
        (app_id, market_hash_name, currency, fetched_at)
      VALUES (?, ?, ?, ?)
    `);

    try {
      metadata.run([
        history.appId,
        history.marketHashName,
        history.currency,
        Date.now(),
      ]);
    } finally {
      metadata.free();
    }

    db.run("COMMIT");
  } catch (error) {
    db.run("ROLLBACK");
    throw error;
  }

  persistDatabase();
};

export const getCachedScannerPriceHistory = async (
  appId: number,
  marketHashName: string,
): Promise<ScannerPriceHistory | null> => {
  const key = getKey(appId, marketHashName);
  const cached = cache.get(key);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const stored = await readFromDatabase(appId, marketHashName);

  if (!stored) {
    cache.delete(key);
    return null;
  }

  cache.set(key, {
    data: stored,
    expiresAt: Date.now() + CACHE_TTL,
  });

  return stored;
};

const getRetryAfterMs = (response: Response): number => {
  const retryAfter = response.headers.get("Retry-After");

  if (!retryAfter) {
    return DEFAULT_RATE_LIMIT_DELAY_MS;
  }

  // Retry-After может содержать количество секунд.
  const seconds = Number(retryAfter);

  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.max(60_000, seconds * 1000);
  }

  // Или дату, например: Wed, 21 Oct 2026 07:28:00 GMT.
  const retryAt = Date.parse(retryAfter);

  if (Number.isFinite(retryAt)) {
    return Math.max(60_000, retryAt - Date.now());
  }

  return DEFAULT_RATE_LIMIT_DELAY_MS;
};

export const getScannerPriceHistory = async (
  _steamId: string,
  appId: number,
  marketHashName: string,
): Promise<ScannerPriceHistory> => {
  const cached = await getCachedScannerPriceHistory(appId, marketHashName);

  if (cached) {
    return cached;
  }

  const url =
    `https://steamcommunity.com/market/pricehistory/?appid=${appId}` +
    `&market_hash_name=${encodeURIComponent(marketHashName)}` +
    `&currency=18`;

  const session = getActiveSteamSession();

  const response = await fetch(url, {
    headers: {
      Accept: "application/json, text/javascript, */*; q=0.01",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36",
      Referer:
        `https://steamcommunity.com/market/listings/${appId}/` +
        encodeURIComponent(marketHashName),
      Origin: "https://steamcommunity.com",
      "X-Requested-With": "XMLHttpRequest",
      ...(session
        ? {
            Cookie: [
              `steamLoginSecure=${session.steamLoginSecure}`,
              `sessionid=${session.sessionId}`,
            ].join("; "),
          }
        : {}),
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (response.status === 429) {
    const retryAfterMs = getRetryAfterMs(response);

    throw new SteamRateLimitError(
      `Steam price history rate limited (HTTP 429). Retry after ${Math.ceil(
        retryAfterMs / 1000,
      )} seconds.`,
      retryAfterMs,
    );
  }

  if (response.status === 403) {
    throw new Error(
      "Steam price history blocked the request (HTTP 403). Collection paused.",
    );
  }

  if (!response.ok) {
    const body = await response.text();

    if (response.status === 429) {
      const retryAfterMs = getRetryAfterMs(response);

      throw new SteamRateLimitError(
        `Steam price history rate limited (HTTP 429). Retry after ${Math.ceil(
          retryAfterMs / 1000,
        )} seconds.`,
        retryAfterMs,
      );
    }

    if (response.status === 403) {
      throw new Error(
        "Steam price history blocked the request (HTTP 403). Collection paused.",
      );
    }

    if (response.status === 400) {
      throw new Error(
        `Steam price history unavailable (HTTP 400): ${marketHashName}; body=${body}`,
      );
    }

    throw new Error(`Steam price history failed: HTTP ${response.status}`);
  }

  const data = (await response.json()) as SteamPriceHistoryResponse;

  if (data.success !== true || !Array.isArray(data.prices)) {
    throw new Error("Steam returned no price history");
  }

  const points = data.prices.flatMap((entry): SteamPricePoint[] => {
    const [date, rawPrice, rawVolume] = entry;

    const price = Number(rawPrice);
    const volume = Number(rawVolume);
    const timestamp = Date.parse(date);

    if (
      !Number.isFinite(price) ||
      !Number.isFinite(volume) ||
      !Number.isFinite(timestamp)
    ) {
      return [];
    }

    return [
      {
        date,
        timestamp,
        price,
        volume,
      },
    ];
  });

  const result: ScannerPriceHistory = {
    appId,
    marketHashName,
    currency: data.price_suffix ?? data.price_prefix ?? "",
    points,
  };

  await saveToDatabase(result);

  cache.set(getKey(appId, marketHashName), {
    data: result,
    expiresAt: Date.now() + CACHE_TTL,
  });

  return result;
};

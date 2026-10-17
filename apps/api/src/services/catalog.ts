import { getDatabase, persistDatabase } from "../db";
import {
  CatalogSyncProgress,
  CatalogSyncResult,
  SteamCatalogItem,
  SteamCatalogPage,
  SteamCatalogResponse,
  StoredCatalogItem,
} from "../types/catalog";
import { steamFetch } from "./steam-fetch";

const CATALOG_TTL = 7 * 24 * 60 * 60 * 1000;
const PAGE_SIZE = 10;
const PAGE_DELAY_MS = 2000;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const ensureSyncTable = async (): Promise<void> => {
  const db = await getDatabase();

  db.run(`
    CREATE TABLE IF NOT EXISTS catalog_sync_state (
      app_id INTEGER PRIMARY KEY,
      last_success_at INTEGER NOT NULL DEFAULT 0,
      total_count INTEGER NOT NULL DEFAULT 0,
      next_start INTEGER NOT NULL DEFAULT 0,
      is_complete INTEGER NOT NULL DEFAULT 0
    )
  `);

  const columns = db.exec("PRAGMA table_info(catalog_sync_state)");
  const names = new Set(
    (columns[0]?.values ?? []).map((column) => String(column[1])),
  );

  if (!names.has("next_start")) {
    db.run(`
      ALTER TABLE catalog_sync_state
      ADD COLUMN next_start INTEGER NOT NULL DEFAULT 0
    `);
  }

  if (!names.has("is_complete")) {
    db.run(`
      ALTER TABLE catalog_sync_state
      ADD COLUMN is_complete INTEGER NOT NULL DEFAULT 0
    `);
  }

  persistDatabase();
};

const getCatalogSyncState = async (
  appId: number,
): Promise<{
  timestamp: number;
  totalCount: number;
  nextStart: number;
  isComplete: boolean;
} | null> => {
  await ensureSyncTable();

  const db = await getDatabase();
  const statement = db.prepare(`
    SELECT last_success_at, total_count, next_start, is_complete
    FROM catalog_sync_state
    WHERE app_id = ?
  `);

  statement.bind([appId]);

  try {
    if (!statement.step()) return null;

    const row = statement.getAsObject();

    return {
      timestamp: Number(row.last_success_at),
      totalCount: Number(row.total_count),
      nextStart: Number(row.next_start),
      isComplete: Number(row.is_complete) === 1,
    };
  } finally {
    statement.free();
  }
};

const saveCatalogSyncProgress = async (
  appId: number,
  nextStart: number,
  totalCount: number,
): Promise<void> => {
  const db = await getDatabase();

  db.run(
    `
      INSERT INTO catalog_sync_state (
        app_id, last_success_at, total_count, next_start, is_complete
      )
      VALUES (?, 0, ?, ?, 0)
      ON CONFLICT(app_id) DO UPDATE SET
        total_count = excluded.total_count,
        next_start = excluded.next_start,
        is_complete = 0
    `,
    [appId, totalCount, nextStart],
  );

  persistDatabase();
};

const markSyncSuccessful = async (
  appId: number,
  totalCount: number,
): Promise<void> => {
  const db = await getDatabase();

  db.run(
    `
      INSERT INTO catalog_sync_state (
        app_id, last_success_at, total_count, next_start, is_complete
      )
      VALUES (?, ?, ?, 0, 1)
      ON CONFLICT(app_id) DO UPDATE SET
        last_success_at = excluded.last_success_at,
        total_count = excluded.total_count,
        next_start = 0,
        is_complete = 1
    `,
    [appId, Date.now(), totalCount],
  );

  persistDatabase();
};

const saveCatalogItems = async (items: SteamCatalogItem[]): Promise<void> => {
  if (items.length === 0) return;

  const db = await getDatabase();
  const now = new Date();
  const updatedAt = now.toISOString();
  const nextUpdateAt = new Date(now.getTime() + CATALOG_TTL).toISOString();

  db.run("BEGIN TRANSACTION");

  try {
    const statement = db.prepare(`
      INSERT INTO market_items (
        app_id,
        market_hash_name,
        name,
        market_url,
        image_url,
        current_price,
        volume,
        updated_at,
        next_update_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(app_id, market_hash_name) DO UPDATE SET
        name = excluded.name,
        market_url = excluded.market_url,
        image_url = excluded.image_url,
        current_price = excluded.current_price,
        volume = excluded.volume,
        updated_at = excluded.updated_at,
        next_update_at = excluded.next_update_at
    `);

    try {
      for (const item of items) {
        statement.run([
          item.appId,
          item.marketHashName,
          item.name,
          item.marketUrl,
          item.iconUrl,
          item.sellPrice === null ? null : item.sellPrice / 100,
          item.sellListings,
          updatedAt,
          nextUpdateAt,
        ]);
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

const fetchWithRetry = async (url: URL, retries = 3): Promise<Response> => {
  for (let attempt = 1; ; attempt++) {
    try {
      return await steamFetch(url, {
        signal: AbortSignal.timeout(60_000),
      });
    } catch (error) {
      if (attempt >= retries) throw error;

      console.warn(
        `[Catalog sync] Request timeout/error, retry ${attempt}/${retries}`,
      );

      await sleep(2_000 * attempt);
    }
  }
};

export const fetchSteamCatalogPage = async (
  appId: number,
  start: number,
  count: number,
): Promise<SteamCatalogPage> => {
  const url = new URL("https://steamcommunity.com/market/search/render/");

  url.search = new URLSearchParams({
    appid: String(appId),
    query: "",
    start: String(start),
    count: String(count),
    search_descriptions: "0",
    norender: "1",
    country: "UA",
    currency: "18",
    l: "english",
  }).toString();

  const response = await fetchWithRetry(url);

  if (response.status === 403) {
    throw new Error(
      "Steam catalog blocked the request (HTTP 403). Collection paused.",
    );
  }

  if (!response.ok) {
    throw new Error(`Steam catalog request failed: HTTP ${response.status}`);
  }

  const data = (await response.json()) as SteamCatalogResponse;

  if (!data.success || !Array.isArray(data.results)) {
    throw new Error("Steam returned an invalid catalog response");
  }

  const hasExpectedCurrency = data.results.every((item) => {
    if (!item.sell_price_text) return true;

    return item.sell_price_text.includes("₴");
  });

  if (!hasExpectedCurrency) {
    throw new Error(
      `Steam returned unexpected currency. Requested UAH (18), received: ${
        data.results.find(
          (item) => item.sell_price_text && !item.sell_price_text.includes("₴"),
        )?.sell_price_text
      }`,
    );
  }

  const items: SteamCatalogItem[] = data.results
    .filter(
      (item) => item.hash_name || item.asset_description?.market_hash_name,
    )
    .map((item) => {
      const marketHashName =
        item.hash_name ?? item.asset_description?.market_hash_name ?? "";
      const iconPath =
        item.asset_description?.icon_url_large ||
        item.asset_description?.icon_url;
      return {
        appId,
        name: item.name ?? marketHashName,
        marketHashName,
        sellListings: Number(item.sell_listings ?? 0),
        sellPrice: typeof item.sell_price === "number" ? item.sell_price : null,
        sellPriceText: item.sell_price_text ?? null,
        iconUrl: iconPath
          ? `https://community.cloudflare.steamstatic.com/economy/image/${iconPath}`
          : null,
        marketUrl:
          `https://steamcommunity.com/market/listings/` +
          `${appId}/${encodeURIComponent(marketHashName)}`,
      };
    });

  await saveCatalogItems(items);

  const rawCount = data.results.length;
  const nextOffset = start + rawCount;

  return {
    appId,
    items,
    start,
    nextStart:
      rawCount > 0 && nextOffset < data.total_count ? nextOffset : null,
    totalCount: data.total_count,
  };
};

export const getStoredSteamCatalog = async (
  appId: number,
): Promise<StoredCatalogItem[]> => {
  const db = await getDatabase();

  const statement = db.prepare(`
  SELECT
    app_id,
    name,
    market_hash_name,
    market_url,
    image_url,
    current_price,
    volume
  FROM market_items
  WHERE app_id = ?
  ORDER BY market_hash_name
`);

  statement.bind([appId]);

  const items: StoredCatalogItem[] = [];

  try {
    while (statement.step()) {
      const row = statement.getAsObject();

      items.push({
        appId: Number(row.app_id),
        name: String(row.name ?? row.market_hash_name),
        marketHashName: String(row.market_hash_name),
        marketUrl: String(row.market_url),
        imageUrl: row.image_url ? String(row.image_url) : null,
        sellPrice:
          row.current_price === null || row.current_price === undefined
            ? null
            : Number(row.current_price),
        sellListings: Number(row.volume ?? 0),
      });
    }
  } finally {
    statement.free();
  }

  return items;
};

export const syncSteamCatalog = async (
  appId: number,
  onProgress?: (progress: CatalogSyncProgress) => void,
  force = false,
): Promise<CatalogSyncResult> => {
  const state = await getCatalogSyncState(appId);

  if (
    !force &&
    state?.isComplete &&
    Date.now() - state.timestamp < CATALOG_TTL
  ) {
    const storedItems = await getStoredSteamCatalog(appId);

    return {
      synced: false,
      processed: storedItems.length,
      totalCount: state.totalCount,
    };
  }

  let offset = state && !state.isComplete ? state.nextStart : 0;
  let processed = 0;
  let totalCount = state?.totalCount ?? 0;

  while (true) {
    const page = await fetchSteamCatalogPage(appId, offset, PAGE_SIZE);

    totalCount = page.totalCount;
    processed += page.items.length;

    const nextOffset = page.nextStart ?? offset + page.items.length;

    await saveCatalogSyncProgress(appId, nextOffset, totalCount);

    onProgress?.({
      processed: offset + page.items.length,
      totalCount,
      currentItem: page.items.at(-1)?.marketHashName ?? null,
    });

    if (page.nextStart === null || page.nextStart <= offset) {
      break;
    }

    offset = page.nextStart;
    await sleep(PAGE_DELAY_MS);
  }

  await markSyncSuccessful(appId, totalCount);

  return {
    synced: true,
    processed: totalCount,
    totalCount,
  };
};

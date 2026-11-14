const CURRENCY = "RUB";

const PRICES_URL = `https://market.csgo.com/api/v2/prices/${CURRENCY}.json`;
const FULL_EXPORT_URL = `https://market.csgo.com/api/full-export/${CURRENCY}.json`;

const PRICES_TTL_MS = 5 * 60 * 1000;
const CHUNK_DELAY_MS = 200;
const RETRIES = 3;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface MarketCsgoPrice {
  priceRub: number;
  buyOrderRub: number | null;
}

const fetchJson = async (url: string, retries = RETRIES): Promise<any> => {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        throw new Error(`Market.CSGO request failed: HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      if (attempt >= retries) throw error;

      console.warn(`[Market.CSGO] Request failed, retry ${attempt}/${retries}`);

      await sleep(2_000 * attempt);
    }
  }
};

let cache: { items: Map<string, MarketCsgoPrice>; fetchedAt: number } | null =
  null;
let inFlight: Promise<Map<string, MarketCsgoPrice>> | null = null;

// Быстрый эндпоинт: словарь { name: { price, buy_order } }
const loadFromPrices = async (): Promise<Map<string, MarketCsgoPrice>> => {
  const data = await fetchJson(PRICES_URL);

  if (!data?.success || !Array.isArray(data.items)) {
    throw new Error("Market.CSGO returned an invalid price list");
  }

  if (data.items.length === 0) {
    throw new Error("Market.CSGO price list is empty");
  }

  // Одноразовый лог, чтобы увидеть формат цены в сыром виде
  console.log("[Market.CSGO] sample entry:", JSON.stringify(data.items[0]));

  const items = new Map<string, MarketCsgoPrice>();

  for (const row of data.items) {
    const name = String(row.market_hash_name ?? "");

    if (!name) continue;

    const price = Number(row.price);

    if (!Number.isFinite(price) || price <= 0) continue;

    const buyOrder = Number(row.buy_order);

    items.set(name, {
      priceRub: price,
      buyOrderRub: Number.isFinite(buyOrder) && buyOrder > 0 ? buyOrder : null,
    });
  }

  return items;
};

// Запасной вариант: полный экспорт. Шаг 1 — список чанков, шаг 2 — сами чанки.
const loadFromFullExport = async (): Promise<Map<string, MarketCsgoPrice>> => {
  const meta = await fetchJson(FULL_EXPORT_URL);

  if (!meta.success || !Array.isArray(meta.items)) {
    throw new Error("Market.CSGO full export failed");
  }

  const format: string[] = meta.format ?? [];
  const items = new Map<string, MarketCsgoPrice>();
  let loaded = 0;

  for (const file of meta.items) {
    const chunk = await fetchJson(
      `https://market.csgo.com/api/full-export/${file}`,
    );

    const rows: any[] = Array.isArray(chunk) ? chunk : (chunk.items ?? []);

    for (const row of rows) {
      let name: string | null = null;
      let price: number | null = null;

      if (Array.isArray(row)) {
        // Значения идут в порядке полей из format
        name = String(row[format.indexOf("market_hash_name")] ?? "");
        price = Number(row[format.indexOf("price")]);
      } else {
        name = String(row.market_hash_name ?? "");
        price = Number(row.price);
      }

      if (!name || !Number.isFinite(price) || price <= 0) continue;

      items.set(name, { priceRub: price / 100, buyOrderRub: null });
      loaded += 1;
    }

    await sleep(CHUNK_DELAY_MS);
  }

  if (loaded === 0) {
    throw new Error("Market.CSGO full export returned no items");
  }

  console.log(`[Market.CSGO] Full export: loaded ${loaded} prices`);

  return items;
};

export const getMarketCsgoPrices = async (): Promise<
  Map<string, MarketCsgoPrice>
> => {
  if (cache && Date.now() - cache.fetchedAt < PRICES_TTL_MS) {
    return cache.items;
  }

  if (inFlight) return inFlight;

  inFlight = (async () => {
    const items = await loadFromPrices();

    cache = { items, fetchedAt: Date.now() };

    return items;
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
};

// ---- Продажи за неделю ----

const HISTORY_INDEX_URL =
  "https://market.csgo.com/api/v2/full-history/all.json";
const HISTORY_TTL_MS = 60 * 60 * 1000;

let historyIndexCache: {
  ids: Map<string, string>;
  fetchedAt: number;
} | null = null;

export const getItemIdIndex = async (): Promise<Map<string, string>> => {
  if (
    historyIndexCache &&
    Date.now() - historyIndexCache.fetchedAt < HISTORY_TTL_MS
  ) {
    return historyIndexCache.ids;
  }

  const data = await fetchJson(HISTORY_INDEX_URL);
  const ids = new Map<string, string>();

  if (data?.history && typeof data.history === "object") {
    for (const [name, id] of Object.entries(data.history)) {
      ids.set(name, String(id));
    }
  }

  historyIndexCache = { ids, fetchedAt: Date.now() };

  console.log(`[Market.CSGO] History index: ${ids.size} items`);

  return ids;
};

const salesCache = new Map<
  string,
  { sales7d: number | null; fetchedAt: number }
>();
const SALES_TTL_MS = 60 * 60 * 1000;

const getSales7d = async (name: string): Promise<number | null> => {
  try {
    const cached = salesCache.get(name);

    if (cached && Date.now() - cached.fetchedAt < SALES_TTL_MS) {
      return cached.sales7d;
    }

    const index = await getItemIdIndex();
    const id = index.get(name);

    if (!id) return null;

    const data = await fetchJson(
      `https://market.csgo.com/api/v2/full-history/${id}.json`,
      2,
    );

    const sales = Number(data?.data?.sales7d?.RUB);
    const value = Number.isFinite(sales) ? sales : null;

    salesCache.set(name, { sales7d: value, fetchedAt: Date.now() });

    return value;
  } catch {
    return null;
  }
};

export const getSales7dBatch = async (
  names: string[],
  concurrency = 5,
): Promise<Map<string, number | null>> => {
  const result = new Map<string, number | null>();
  let cursor = 0;

  const workers = Array.from(
    { length: Math.min(concurrency, names.length) },
    async () => {
      while (cursor < names.length) {
        const name = names[cursor++];
        result.set(name, await getSales7d(name));
      }
    },
  );

  await Promise.all(workers);

  return result;
};

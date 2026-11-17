import { Router } from "express";
import {
  getMarketCsgoPrices,
  getSales7dBatch,
} from "../services/market-csgo-client";
import { getStoredSteamCatalog } from "../services/catalog";
import { getSteamBuyOrder } from "../services/steam-buy-order";
import type { SteamCurrency } from "../services/steam-buy-order";

const router = Router();

const SALES_CHUNK = 100;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

// Предмет для расчёта курса: дешёвый, всегда в продаже
const RATE_ITEM = "Chroma 2 Case";

let rateCache: { value: number; fetchedAt: number } | null = null;
const RATE_TTL_MS = 60 * 60 * 1000; // час

async function fetchSteamPrice(
  hashName: string,
  currency: string,
): Promise<number | null> {
  const url = `https://steamcommunity.com/market/priceoverview/?appid=730&currency=${currency}&market_hash_name=${encodeURIComponent(hashName)}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data?.success || !data.lowest_price) return null;
  const m = String(data.lowest_price)
    .replace(/\u00A0/g, "")
    .replace(",", ".")
    .match(/([\d.]+)/);
  return m ? parseFloat(m[1]) : null;
}

router.get("/steam-rate", async (_req, res) => {
  try {
    if (rateCache && Date.now() - rateCache.fetchedAt < RATE_TTL_MS) {
      return res.json({ rate: rateCache.value, cached: true });
    }

    const [rub, uah] = await Promise.all([
      fetchSteamPrice(RATE_ITEM, "5"),
      fetchSteamPrice(RATE_ITEM, "18"),
    ]);

    if (!rub || !uah) {
      // свежий курс не посчитался — отдаём старый из кэша, если есть
      if (rateCache) {
        return res.json({ rate: rateCache.value, cached: true, stale: true });
      }
      return res.status(502).json({ error: "Не удалось получить курс Стима" });
    }

    const rate = rub / uah;
    rateCache = { value: rate, fetchedAt: Date.now() };

    res.json({ rate, cached: false });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed",
    });
  }
});

// Топ-5 самых дешёвых предложений на продажу в Стиме (автобай), в рублях
async function getSteamSellOrdersTop(hashName: string): Promise<number[]> {
  const url = new URL("https://steamcommunity.com/market/orderbook");
  url.search = new URLSearchParams({
    q: "Load",
    qp: JSON.stringify([730, hashName]),
    cc: "RU",
    l: "russian",
    currency: "5",
  }).toString();

  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "application/json",
      Referer: `https://steamcommunity.com/market/listings/730/${encodeURIComponent(hashName)}`,
      "x-valve-request-type": "queryAction",
    },
  });

  if (res.status === 429) throw new Error("лимит стима (429)");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const raw = await res.text();
  if (raw.trimStart().startsWith("<"))
    throw new Error("пришел HTML вместо JSON");

  const outer = JSON.parse(raw);
  const payload = "success" in outer ? outer : outer.data;
  if (!payload?.success)
    throw new Error("success=false — проверь имя предмета");

  const flat = payload.data?.rgCompactSellOrders;
  if (!Array.isArray(flat)) return [];

  const prices: number[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) {
    prices.push(flat[i] / 100);
  }

  // самые дешёвые первыми, берем топ-5
  return prices.sort((a, b) => a - b).slice(0, 5);
}

router.get("/market-items", async (req, res) => {
  try {
    const appid = Number(req.query.appid ?? 730);
    const minPrice = Number(req.query.minPrice ?? 0);
    const maxPrice = Number(req.query.maxPrice ?? Number.MAX_SAFE_INTEGER);
    const search = String(req.query.search ?? "")
      .trim()
      .toLowerCase();
    const limit = Math.min(Math.max(Number(req.query.limit ?? 30), 1), 100);
    const offset = Math.max(Number(req.query.offset ?? 0), 0);

    if (!Number.isFinite(minPrice) || !Number.isFinite(maxPrice)) {
      return res
        .status(400)
        .json({ error: "minPrice/maxPrice must be numbers" });
    }

    const [prices, catalog] = await Promise.all([
      getMarketCsgoPrices(),
      getStoredSteamCatalog(appid),
    ]);

    const steamByName = new Map(
      catalog.map((item) => [item.marketHashName, item]),
    );

    type Row = {
      marketHashName: string;
      imageUrl: string | null;
      steamPriceUah: number | null;
      marketPriceRub: number;
      marketBuyOrderRub: number | null;
      sales7d: number | null;
    };

    const rows: Row[] = [];

    for (const [name, market] of prices) {
      if (market.priceRub < minPrice || market.priceRub > maxPrice) continue;
      if (search && !name.toLowerCase().includes(search)) continue;

      const steam = steamByName.get(name);

      rows.push({
        marketHashName: name,
        imageUrl: steam?.imageUrl ?? null,
        steamPriceUah: steam?.sellPrice ?? null,
        marketPriceRub: market.priceRub,
        marketBuyOrderRub: market.buyOrderRub,
        sales7d: null,
      });
    }

    const total = rows.length;

    // продажи тянем для ВСЕГО диапазона, батчами по 100
    for (let i = 0; i < rows.length; i += SALES_CHUNK) {
      const chunk = rows.slice(i, i + SALES_CHUNK);
      const sales = await getSales7dBatch(chunk.map((r) => r.marketHashName));
      for (const row of chunk) {
        row.sales7d = sales.get(row.marketHashName) ?? null;
      }
    }

    // главная сортировка — по продажам за неделю, при равных — по цене
    rows.sort(
      (a, b) =>
        (b.sales7d ?? 0) - (a.sales7d ?? 0) ||
        a.marketPriceRub - b.marketPriceRub,
    );

    const page = rows.slice(offset, offset + limit);

    res.json({
      total,
      offset,
      limit,
      items: page,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to load items",
    });
  }
});

router.get("/steam-buy-order", async (req, res) => {
  const name = String(req.query.name ?? "");
  const currency: SteamCurrency = req.query.currency === "UAH" ? "UAH" : "RUB";

  if (!name) return res.status(400).json({ error: "name is required" });

  try {
    const book = await getSteamBuyOrder(name, currency);

    res.json({
      marketHashName: name,
      currency,
      buyOrderRub: book.buyOrderRub,
      buyOrders: book.buyOrders,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed",
    });
  }
});

router.get("/steam-sell-orders", async (req, res) => {
  const name = String(req.query.name ?? "");

  if (!name) return res.status(400).json({ error: "name is required" });

  try {
    const sellOrders = await getSteamSellOrdersTop(name);

    res.json({
      marketHashName: name,
      sellOrders,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed",
    });
  }
});

router.post("/market-prices", async (req, res) => {
  try {
    const names: string[] = Array.isArray(req.body?.names)
      ? req.body.names
          .map((n: unknown) => String(n ?? "").trim())
          .filter((n: string) => n.length > 0)
          .slice(0, 500)
      : [];

    if (names.length === 0) {
      return res.status(400).json({ error: "names is required" });
    }

    const prices = await getMarketCsgoPrices();

    const items = names.map((name) => {
      const market = prices.get(name);

      return {
        marketHashName: name,
        marketPriceRub: market?.priceRub ?? null,
        marketBuyOrderRub: market?.buyOrderRub ?? null,
      };
    });

    res.json({ items });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed",
    });
  }
});

export default router;

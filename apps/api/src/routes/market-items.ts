import { Router } from "express";
import {
  getMarketCsgoPrices,
  getSales7dBatch,
} from "../services/market-csgo-client";
import { getStoredSteamCatalog } from "../services/catalog";
import { getSteamBuyOrder } from "../services/steam-buy-order";
import type { SteamCurrency } from "../services/steam-buy-order";

const router = Router();

// размер одного батча запроса продаж
const SALES_CHUNK = 100;

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

export default router;

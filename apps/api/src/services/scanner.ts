import { fetchSteamCatalogPage } from "./catalog";
import { getScannerPriceHistory } from "./scanner-price-history";
import { analyzePriceHistory } from "./scanner-analysis";
import { getSteamSession } from "./steam-session";

export interface ScannerSettings {
  appId: number;
  start: number;
  count: number;
  steamId: string;
  historyDays: number;
  priceBasis: "median" | "current";
  minProfitPercent: number;
  minSalesCount: number;
  maxBuyPrice: number | null;
}

export const scanCatalog = async (settings: ScannerSettings) => {
  const {
    appId,
    start,
    count,
    steamId,
    historyDays,
    priceBasis,
    minProfitPercent,
    minSalesCount,
    maxBuyPrice,
  } = settings;

  const steamLoginSecure = getSteamSession(steamId);

  if (!steamLoginSecure) {
    throw new Error("Steam session not found");
  }

  const catalog = await fetchSteamCatalogPage(appId, start, count);

  console.log(
    "[Catalog currency check]",
    catalog.items.slice(0, 5).map((item) => ({
      name: item.marketHashName,
      sellPrice: item.sellPrice,
      sellPriceText: item.sellPriceText,
    })),
  );

  const candidates = [];

  for (const item of catalog.items) {
    if (item.sellPrice === null || item.sellPrice <= 0) {
      continue;
    }

    const buyPrice = item.sellPrice / 100;

    if (maxBuyPrice !== null && buyPrice > maxBuyPrice) {
      continue;
    }

    try {
      const history = await getScannerPriceHistory(
        steamId,
        appId,
        item.marketHashName,
      );

      const analysis = analyzePriceHistory(
        history.points,
        {
          historyDays,
          priceBasis,
          minProfitPercent,
          minSalesCount,
          maxBuyPrice,
        },
        buyPrice,
      );
      console.log("[Scanner history]", {
        name: item.marketHashName,
        catalogPrice: item.sellPrice === null ? null : item.sellPrice / 100,
        catalogPriceText: item.sellPriceText,
        historyCurrency: history.currency,
        historyLastPrice: history.points.at(-1)?.price,
        historyLastDate: history.points.at(-1)?.date,
      });
      if (analysis.isCandidate) {
        candidates.push({
          appId,
          name: item.name,
          marketHashName: item.marketHashName,
          marketUrl: item.marketUrl,
          buyPrice,
          currency: history.currency,
          analysis,
        });
      }
    } catch (error) {
      console.warn(
        `[Scanner] Skipped ${item.marketHashName}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  return {
    appId,
    scanned: catalog.items.length,
    candidates,
    nextStart: catalog.nextStart,
    totalCount: catalog.totalCount,
    settings: {
      historyDays,
      priceBasis,
      minProfitPercent,
      minSalesCount,
      maxBuyPrice,
    },
  };
};

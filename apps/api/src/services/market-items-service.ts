import { getStoredSteamCatalog } from "./catalog";
import { getMarketCsgoPrices } from "./market-csgo-client";

export interface MarketItemRow {
  marketHashName: string;
  name: string;
  imageUrl: string | null;
  steamPriceUah: number | null;
  marketPriceRub: number | null;
  sellListings: number;
}

interface Filters {
  appId: number;
  minSales?: number;
  limit?: number;
}

export const getMarketItems = async (
  filters: Filters,
): Promise<MarketItemRow[]> => {
  const [catalog, marketPrices] = await Promise.all([
    getStoredSteamCatalog(filters.appId),
    getMarketCsgoPrices(),
  ]);

  const minSales = filters.minSales ?? 0;
  const rows: MarketItemRow[] = [];

  for (const item of catalog) {
    if (item.sellListings < minSales) continue;

    const marketPrice = marketPrices.get(item.marketHashName);

    if (!marketPrice) continue;

    rows.push({
      marketHashName: item.marketHashName,
      name: item.name,
      imageUrl: item.imageUrl,
      steamPriceUah: item.sellPrice,
      marketPriceRub: marketPrice.priceRub,
      sellListings: item.sellListings,
    });
  }

  return rows.slice(0, filters.limit ?? 100);
};

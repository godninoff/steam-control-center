import type { BuyOrder, MarketHistoryItem, MarketSellListing } from "./types";
import type { ScannerSettings } from "./scanner-types";

const API_URL = "http://localhost:4000";

export const getMarketHistory = async (
  steamId: string,
  start = 0,
): Promise<{
  items: MarketHistoryItem[];
  nextStart: number | null;
}> => {
  const response = await fetch(
    `${API_URL}/api/market/history?steamId=${encodeURIComponent(steamId)}&start=${start}`,
  );

  if (!response.ok) {
    throw new Error("Failed to load market history");
  }

  return response.json();
};

export const getBuyOrders = async (steamId: string): Promise<BuyOrder[]> => {
  const response = await fetch(
    `${API_URL}/api/market/buy-orders?steamId=${encodeURIComponent(steamId)}`,
  );

  if (!response.ok) {
    throw new Error("Failed to load buy orders");
  }

  const data = await response.json();
  return data.buyOrders ?? [];
};

export const getSellListings = async (
  steamId: string,
): Promise<MarketSellListing[]> => {
  const response = await fetch(
    `${API_URL}/api/market/sell-listings?steamId=${encodeURIComponent(steamId)}`,
  );

  if (!response.ok) {
    throw new Error("Failed to load sell listings");
  }

  const data = await response.json();
  return data.sellListings ?? [];
};

export interface ScannerCandidate {
  appId: number;
  name: string;
  marketHashName: string;
  marketUrl: string;
  buyPrice: number;
  currency: string;
  imageUrl: string | null;
  analysis: {
    currentPrice: number | null;
    medianPrice: number | null;
    totalVolume: number;
    comparisonPrice: number | null;
    profit: number | null;
    profitPercent: number | null;
    isCandidate: boolean;
  };
}

export type ScannerJobStatus = "queued" | "running" | "completed" | "failed";

export interface ScannerResult {
  id: string;
  status: ScannerJobStatus;
  appId: number;
  scanned: number;
  totalCount: number | null;
  currentItem: string | null;
  candidates: ScannerCandidate[];
  error: string | null;
  createdAt: string;
  updatedAt: string;
  settings: ScannerSettings;
}

const parseResponse = async <T>(response: Response): Promise<T> => {
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error ?? "Request failed");
  }

  return data as T;
};

export const scanCatalog = async (
  steamId: string,
  settings: ScannerSettings,
  start = 0,
  count = 10,
): Promise<ScannerResult> => {
  const response = await fetch(`${API_URL}/api/scanner/scan`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      steamId,
      appid: 730,
      start,
      count,
      historyDays: settings.historyDays,
      priceBasis: settings.priceBasis,
      minProfitPercent: settings.minProfitPercent,
      minSalesCount: settings.minSalesCount,
      maxBuyPrice:
        settings.maxBuyPrice === null ? "none" : settings.maxBuyPrice,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error ?? "Не удалось запустить сканирование");
  }

  return (data.job ?? data) as ScannerResult;
};

export const getScannerJob = async (jobId: string): Promise<ScannerResult> => {
  const response = await fetch(
    `${API_URL}/api/scanner/scan/${encodeURIComponent(jobId)}`,
  );

  return parseResponse<ScannerResult>(response);
};

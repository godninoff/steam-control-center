import type { SteamPricePoint } from "./scanner-price-history";

export interface ScannerAnalysisSettings {
  historyDays: number;
  priceBasis: "median" | "current";
  minProfitPercent: number;
  maxBuyPrice: number | null;
  minSalesCount: number;
}

export interface ScannerPriceAnalysis {
  currentPrice: number | null;
  medianPrice: number | null;
  totalVolume: number;
  pointsInPeriod: number;
  comparisonPrice: number | null;
  profit: number | null;
  profitPercent: number | null;
  passesMinSalesCount: boolean;
  passesMaxBuyPrice: boolean;
  passesMinProfit: boolean;
  isCandidate: boolean;
}

export const analyzePriceHistory = (
  points: SteamPricePoint[],
  settings: ScannerAnalysisSettings,
  buyPrice: number | null = null,
  now = Date.now(),
): ScannerPriceAnalysis => {
  const periodStart = now - settings.historyDays * 24 * 60 * 60 * 1000;

  const periodPoints = points
    .filter(
      (point) =>
        point.timestamp >= periodStart &&
        point.timestamp <= now &&
        point.price > 0 &&
        Number.isFinite(point.price) &&
        Number.isFinite(point.volume) &&
        point.volume >= 0,
    )
    .sort((a, b) => a.timestamp - b.timestamp);

  const prices = periodPoints.map((point) => point.price).sort((a, b) => a - b);

  let medianPrice: number | null = null;

  if (prices.length > 0) {
    const middle = Math.floor(prices.length / 2);

    medianPrice =
      prices.length % 2 === 0
        ? (prices[middle - 1] + prices[middle]) / 2
        : prices[middle];
  }

  const currentPrice =
    periodPoints.length > 0
      ? periodPoints[periodPoints.length - 1].price
      : null;

  const totalVolume = periodPoints.reduce(
    (sum, point) => sum + point.volume,
    0,
  );

  const comparisonPrice =
    settings.priceBasis === "median" ? medianPrice : currentPrice;

  const validBuyPrice =
    buyPrice !== null && Number.isFinite(buyPrice) && buyPrice > 0;

  const profit =
    validBuyPrice && comparisonPrice !== null
      ? Number((comparisonPrice - buyPrice).toFixed(2))
      : null;

  const profitPercent =
    profit !== null && validBuyPrice
      ? Number(((profit / buyPrice!) * 100).toFixed(2))
      : null;

  const passesMinSalesCount = totalVolume >= settings.minSalesCount;
  const passesMaxBuyPrice =
    validBuyPrice &&
    (settings.maxBuyPrice === null || buyPrice! <= settings.maxBuyPrice);

  const passesMinProfit =
    profitPercent !== null && profitPercent >= settings.minProfitPercent;

  return {
    currentPrice,
    medianPrice,
    totalVolume,
    pointsInPeriod: periodPoints.length,
    comparisonPrice,
    profit,
    profitPercent,
    passesMinSalesCount,
    passesMaxBuyPrice,
    passesMinProfit,
    isCandidate:
      validBuyPrice &&
      comparisonPrice !== null &&
      passesMinSalesCount &&
      passesMaxBuyPrice &&
      passesMinProfit,
  };
};

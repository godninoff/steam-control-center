import type { ScannerSettings } from "../types/scanner";

const ALLOWED_HISTORY_DAYS = [7, 30, 90];

export const validateScannerSettings = (input: unknown): ScannerSettings => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Settings must be an object");
  }

  const value = input as Record<string, unknown>;

  const {
    maxBuyPrice,
    minProfitPercent,
    minSalesCount,
    historyDays,
    priceBasis,
  } = value;

  if (
    maxBuyPrice !== null &&
    (typeof maxBuyPrice !== "number" ||
      !Number.isFinite(maxBuyPrice) ||
      maxBuyPrice <= 0 ||
      maxBuyPrice > 1_000_000_000)
  ) {
    throw new Error("maxBuyPrice must be null or a positive number");
  }

  if (
    typeof minProfitPercent !== "number" ||
    !Number.isFinite(minProfitPercent) ||
    minProfitPercent < 0 ||
    minProfitPercent > 1000
  ) {
    throw new Error("minProfitPercent must be between 0 and 1000");
  }

  if (
    typeof minSalesCount !== "number" ||
    !Number.isInteger(minSalesCount) ||
    minSalesCount < 0 ||
    minSalesCount > 1_000_000
  ) {
    throw new Error("minSalesCount must be an integer between 0 and 1000000");
  }

  if (
    typeof historyDays !== "number" ||
    !ALLOWED_HISTORY_DAYS.includes(historyDays)
  ) {
    throw new Error("historyDays must be 7, 30, or 90");
  }

  if (priceBasis !== "median" && priceBasis !== "current") {
    throw new Error("priceBasis must be median or current");
  }

  return {
    maxBuyPrice: maxBuyPrice as number | null,
    minProfitPercent,
    minSalesCount,
    historyDays,
    priceBasis,
  };
};
